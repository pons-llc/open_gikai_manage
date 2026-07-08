import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str, type ParsedForm } from "../../lib/forms";
import { factionMembershipSchema, termsOverlap } from "../../validators/factionMemberships";
import { Layout } from "../../views/layout";
import type { SelectOption } from "../../views/admin/committeeMemberships";
import {
  FactionMembershipsPage,
  emptyFactionMembershipForm,
  type FactionMembershipFormValues,
  type FactionMembershipRow,
} from "../../views/admin/factionMemberships";

export const factionMembershipsRoute = new Hono<AppEnv>();

const listMemberships = (DB: D1Database) =>
  DB.prepare(
    `SELECT fm.id, fm.faction_id, f.name AS faction_name, fm.member_id, m.name AS member_name,
            fm.term_start, fm.term_end
     FROM faction_memberships fm
     JOIN factions f ON f.id = fm.faction_id
     JOIN members m ON m.id = fm.member_id
     ORDER BY fm.term_start DESC, fm.id DESC`
  )
    .all<FactionMembershipRow>()
    .then((r) => r.results);

const listFactionOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM factions ORDER BY established_on ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listMemberOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM members ORDER BY seat_number ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): FactionMembershipFormValues => ({
  faction_id: str(form, "faction_id"),
  member_id: str(form, "member_id"),
  term_start: str(form, "term_start"),
  term_end: str(form, "term_end"),
});

const render = async (
  c: Context<AppEnv>,
  form: FactionMembershipFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const [rows, factions, members] = await Promise.all([
    listMemberships(c.env.DB),
    listFactionOptions(c.env.DB),
    listMemberOptions(c.env.DB),
  ]);
  return c.html(
    <Layout title="会派所属管理" variant="admin" adminEmail={c.get("adminEmail")}>
      <FactionMembershipsPage
        rows={rows}
        factions={factions}
        members={members}
        form={form}
        errors={errors}
        editingId={editingId}
      />
    </Layout>,
    status
  );
};

/** §8: 同一議員の所属期間が重複しないこと(同時所属は1会派のみ)。委員会所属と違い faction は問わず member 単位で見る。 */
const checkOverlap = async (
  DB: D1Database,
  memberId: number,
  termStart: string,
  termEnd: string | null,
  editingId: number | null
): Promise<boolean> => {
  const { results } = await DB.prepare(
    `SELECT term_start, term_end FROM faction_memberships WHERE member_id = ? AND id != ?`
  )
    .bind(memberId, editingId ?? -1)
    .all<{ term_start: string; term_end: string | null }>();
  return results.some((r) => termsOverlap(termStart, termEnd, r.term_start, r.term_end));
};

factionMembershipsRoute.get("/", async (c) => render(c, emptyFactionMembershipForm, [], null));

factionMembershipsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, faction_id, member_id, term_start, term_end FROM faction_memberships WHERE id = ?`
  )
    .bind(id)
    .first<{ id: number; faction_id: number; member_id: number; term_start: string; term_end: string | null }>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      faction_id: String(row.faction_id),
      member_id: String(row.member_id),
      term_start: row.term_start,
      term_end: row.term_end ?? "",
    },
    [],
    id
  );
});

factionMembershipsRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = factionMembershipSchema.safeParse({
    faction_id: Number(form.faction_id) || 0,
    member_id: Number(form.member_id) || 0,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const overlap = await checkOverlap(c.env.DB, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end, null);
  if (overlap) {
    return render(c, form, ["この議員は同時に複数の会派に所属できません(既存の所属期間と重複しています)"], null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO faction_memberships (faction_id, member_id, term_start, term_end) VALUES (?, ?, ?, ?)`
  )
    .bind(parsed.data.faction_id, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end)
    .run();
  logAdminMutation(c, "faction_memberships", result.meta.last_row_id ?? null, "create");
  return c.redirect("/admin/faction-memberships");
});

factionMembershipsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = factionMembershipSchema.safeParse({
    faction_id: Number(form.faction_id) || 0,
    member_id: Number(form.member_id) || 0,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const overlap = await checkOverlap(c.env.DB, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end, id);
  if (overlap) {
    return render(c, form, ["この議員は同時に複数の会派に所属できません(既存の所属期間と重複しています)"], id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE faction_memberships SET faction_id = ?, member_id = ?, term_start = ?, term_end = ? WHERE id = ?`
  )
    .bind(parsed.data.faction_id, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "faction_memberships", id, "update");
  return c.redirect("/admin/faction-memberships");
});

factionMembershipsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM faction_memberships WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "faction_memberships", id, "delete");
  return c.redirect("/admin/faction-memberships");
});
