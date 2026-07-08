import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { checkboxOn, str, type ParsedForm } from "../../lib/forms";
import { committeeSchema } from "../../validators/committees";
import { Layout } from "../../views/layout";
import {
  CommitteesPage,
  emptyCommitteeForm,
  type CommitteeFormValues,
  type CommitteeRow,
} from "../../views/admin/committees";

export const committeesRoute = new Hono<AppEnv>();

const listCommittees = (DB: D1Database) =>
  DB.prepare(`SELECT id, name, category, display_order, is_active FROM committees ORDER BY display_order ASC, id ASC`)
    .all<CommitteeRow>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): CommitteeFormValues => ({
  name: str(form, "name"),
  category: str(form, "category") || "standing",
  display_order: str(form, "display_order") || "0",
  is_active: checkboxOn(form, "is_active"),
});

const render = async (
  c: Context<AppEnv>,
  form: CommitteeFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const rows = await listCommittees(c.env.DB);
  return c.html(
    <Layout title="委員会管理" variant="admin" adminEmail={c.get("adminEmail")}>
      <CommitteesPage rows={rows} form={form} errors={errors} editingId={editingId} />
    </Layout>,
    status
  );
};

committeesRoute.get("/", async (c) => render(c, emptyCommitteeForm, [], null));

committeesRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT id, name, category, display_order, is_active FROM committees WHERE id = ?`)
    .bind(id)
    .first<CommitteeRow>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      name: row.name,
      category: row.category,
      display_order: String(row.display_order),
      is_active: !!row.is_active,
    },
    [],
    id
  );
});

committeesRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = committeeSchema.safeParse({
    name: form.name,
    category: form.category,
    display_order: Number(form.display_order) || 0,
    is_active: form.is_active,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO committees (name, category, display_order, is_active) VALUES (?, ?, ?, ?)`
  )
    .bind(parsed.data.name, parsed.data.category, parsed.data.display_order, parsed.data.is_active ? 1 : 0)
    .run();
  logAdminMutation(c, "committees", result.meta.last_row_id ?? null, "create");
  return c.redirect("/admin/committees");
});

committeesRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = committeeSchema.safeParse({
    name: form.name,
    category: form.category,
    display_order: Number(form.display_order) || 0,
    is_active: form.is_active,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE committees SET name = ?, category = ?, display_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(parsed.data.name, parsed.data.category, parsed.data.display_order, parsed.data.is_active ? 1 : 0, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "committees", id, "update");
  return c.redirect("/admin/committees");
});

committeesRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM committees WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyCommitteeForm, ["使用中のため削除できません(委員会所属・日程・議題などで参照されています)"], null, 400);
  }
  logAdminMutation(c, "committees", id, "delete");
  return c.redirect("/admin/committees");
});
