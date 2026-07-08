import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { checkFactionOverlap, createFactionMembership } from "../../lib/memberships";
import { factionMembershipSchema } from "../../validators/factionMemberships";
import { Layout } from "../../views/layout";
import type { SelectOption } from "../../views/admin/committeeMemberships";
import {
  FactionMembershipsPage,
  emptyFactionMembershipForm,
  type FactionMembershipFormValues,
  type FactionMembershipRow,
} from "../../views/admin/factionMemberships";

export const factionMembershipsRoute = new Hono<AppEnv>();

const listMemberships = (DB: D1Database, page: number) =>
  DB.prepare(
    `SELECT fm.id, fm.faction_id, f.name AS faction_name, fm.member_id, m.name AS member_name,
            fm.term_start, fm.term_end
     FROM faction_memberships fm
     JOIN factions f ON f.id = fm.faction_id
     JOIN members m ON m.id = fm.member_id
     ORDER BY fm.term_start DESC, fm.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<FactionMembershipRow>()
    .then((r) => r.results);

const countMemberships = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM faction_memberships`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

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
  status: 200 | 400 = 200,
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, factions, members, count] = await Promise.all([
    listMemberships(c.env.DB, page),
    listFactionOptions(c.env.DB),
    listMemberOptions(c.env.DB),
    countMemberships(c.env.DB),
  ]);
  return c.html(
    <Layout title="会派所属管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <FactionMembershipsPage
        rows={rows}
        factions={factions}
        members={members}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/faction-memberships", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

/** P1-2: 会派所属を10人分入れる場合、会派・所属開始日を引き継ぐ。 */
factionMembershipsRoute.get("/", async (c) => {
  const form = formFromQuery(emptyFactionMembershipForm, c.req.query(), ["faction_id", "term_start"]);
  return render(c, form, [], null, 200, getFlash(c), parsePage(c.req.query("page")));
});

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
  const rawForm = await c.req.parseBody();
  const form = readForm(rawForm);
  const input = {
    faction_id: Number(form.faction_id) || 0,
    member_id: Number(form.member_id) || 0,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  };
  const result = await createFactionMembership(c, input);
  if (!result.ok) {
    return render(c, form, result.errors, null, 400);
  }
  if (str(rawForm, "save_mode") === "continue") {
    return c.redirect(
      withFlash("/admin/faction-memberships", "created", {
        faction_id: String(input.faction_id),
        term_start: input.term_start,
      })
    );
  }
  return c.redirect(withFlash("/admin/faction-memberships", "created"));
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
  const overlap = await checkFactionOverlap(c.env.DB, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end, id);
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
  return c.redirect(withFlash("/admin/faction-memberships", "updated"));
});

factionMembershipsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM faction_memberships WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "faction_memberships", id, "delete");
  return c.redirect(withFlash("/admin/faction-memberships", "deleted"));
});
