import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { checkboxOn, str, type ParsedForm } from "../../lib/forms";
import { memberSchema } from "../../validators/members";
import { Layout } from "../../views/layout";
import {
  MembersPage,
  emptyMemberForm,
  type MemberFormValues,
  type MemberRow,
} from "../../views/admin/members";

export const membersRoute = new Hono<AppEnv>();

const listMembers = (DB: D1Database) =>
  DB.prepare(
    `SELECT id, name, election_count, elected_on, seat_number, is_active FROM members ORDER BY seat_number ASC`
  )
    .all<MemberRow>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): MemberFormValues => ({
  name: str(form, "name"),
  election_count: str(form, "election_count") || "1",
  elected_on: str(form, "elected_on"),
  seat_number: str(form, "seat_number") || "1",
  is_active: checkboxOn(form, "is_active"),
});

const render = async (
  c: Context<AppEnv>,
  form: MemberFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const rows = await listMembers(c.env.DB);
  return c.html(
    <Layout title="議員管理" variant="admin" adminEmail={c.get("adminEmail")}>
      <MembersPage rows={rows} form={form} errors={errors} editingId={editingId} />
    </Layout>,
    status
  );
};

membersRoute.get("/", async (c) => render(c, emptyMemberForm, [], null));

membersRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, name, election_count, elected_on, seat_number, is_active FROM members WHERE id = ?`
  )
    .bind(id)
    .first<MemberRow>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      name: row.name,
      election_count: String(row.election_count),
      elected_on: row.elected_on,
      seat_number: String(row.seat_number),
      is_active: !!row.is_active,
    },
    [],
    id
  );
});

membersRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = memberSchema.safeParse({
    name: form.name,
    election_count: Number(form.election_count) || 0,
    elected_on: form.elected_on,
    seat_number: Number(form.seat_number) || 0,
    is_active: form.is_active,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO members (name, election_count, elected_on, seat_number, is_active) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      parsed.data.name,
      parsed.data.election_count,
      parsed.data.elected_on,
      parsed.data.seat_number,
      parsed.data.is_active ? 1 : 0
    )
    .run();
  logAdminMutation(c, "members", result.meta.last_row_id ?? null, "create");
  return c.redirect("/admin/members");
});

membersRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = memberSchema.safeParse({
    name: form.name,
    election_count: Number(form.election_count) || 0,
    elected_on: form.elected_on,
    seat_number: Number(form.seat_number) || 0,
    is_active: form.is_active,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE members SET name = ?, election_count = ?, elected_on = ?, seat_number = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(
      parsed.data.name,
      parsed.data.election_count,
      parsed.data.elected_on,
      parsed.data.seat_number,
      parsed.data.is_active ? 1 : 0,
      id
    )
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "members", id, "update");
  return c.redirect("/admin/members");
});

membersRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM members WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyMemberForm, ["使用中のため削除できません(委員会所属・会派所属で参照されています)"], null, 400);
  }
  logAdminMutation(c, "members", id, "delete");
  return c.redirect("/admin/members");
});
