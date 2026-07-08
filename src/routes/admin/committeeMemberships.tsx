import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { checkCommitteeOverlap, createCommitteeMembership } from "../../lib/memberships";
import { committeeMembershipSchema } from "../../validators/committeeMemberships";
import { Layout } from "../../views/layout";
import {
  CommitteeMembershipsPage,
  emptyCommitteeMembershipForm,
  type CommitteeMembershipFormValues,
  type CommitteeMembershipRow,
  type SelectOption,
} from "../../views/admin/committeeMemberships";

export const committeeMembershipsRoute = new Hono<AppEnv>();

const listMemberships = (DB: D1Database, page: number) =>
  DB.prepare(
    `SELECT cm.id, cm.committee_id, c.name AS committee_name, cm.member_id, m.name AS member_name,
            cm.role, cm.term_start, cm.term_end
     FROM committee_memberships cm
     JOIN committees c ON c.id = cm.committee_id
     JOIN members m ON m.id = cm.member_id
     ORDER BY cm.term_start DESC, cm.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<CommitteeMembershipRow>()
    .then((r) => r.results);

const countMemberships = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM committee_memberships`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

const listCommitteeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM committees ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listMemberOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM members ORDER BY seat_number ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): CommitteeMembershipFormValues => ({
  committee_id: str(form, "committee_id"),
  member_id: str(form, "member_id"),
  role: str(form, "role") || "member",
  term_start: str(form, "term_start"),
  term_end: str(form, "term_end"),
});

const render = async (
  c: Context<AppEnv>,
  form: CommitteeMembershipFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, committees, members, count] = await Promise.all([
    listMemberships(c.env.DB, page),
    listCommitteeOptions(c.env.DB),
    listMemberOptions(c.env.DB),
    countMemberships(c.env.DB),
  ]);
  return c.html(
    <Layout title="委員会所属管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <CommitteeMembershipsPage
        rows={rows}
        committees={committees}
        members={members}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/memberships", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

/** P1-2: 委員会所属を続けて入力する場合、委員会・役職(=委員に戻す)・任期開始を引き継ぐ。 */
committeeMembershipsRoute.get("/", async (c) => {
  const form = formFromQuery(emptyCommitteeMembershipForm, c.req.query(), ["committee_id", "role", "term_start"]);
  return render(c, form, [], null, 200, getFlash(c), parsePage(c.req.query("page")));
});

committeeMembershipsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, committee_id, member_id, role, term_start, term_end FROM committee_memberships WHERE id = ?`
  )
    .bind(id)
    .first<{ id: number; committee_id: number; member_id: number; role: string; term_start: string; term_end: string | null }>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      committee_id: String(row.committee_id),
      member_id: String(row.member_id),
      role: row.role,
      term_start: row.term_start,
      term_end: row.term_end ?? "",
    },
    [],
    id
  );
});

committeeMembershipsRoute.post("/", async (c) => {
  const rawForm = await c.req.parseBody();
  const form = readForm(rawForm);
  const input = {
    committee_id: Number(form.committee_id) || 0,
    member_id: Number(form.member_id) || 0,
    role: form.role,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  };
  const result = await createCommitteeMembership(c, input);
  if (!result.ok) {
    return render(c, form, result.errors, null, 400);
  }
  if (str(rawForm, "save_mode") === "continue") {
    // §3-1: 連続登録では役職を都度選び直させず「委員」に戻す(委員長・副委員長は通常1人ずつのため)。
    return c.redirect(
      withFlash("/admin/memberships", "created", {
        committee_id: String(input.committee_id),
        role: "member",
        term_start: input.term_start,
      })
    );
  }
  return c.redirect(withFlash("/admin/memberships", "created"));
});

committeeMembershipsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = committeeMembershipSchema.safeParse({
    committee_id: Number(form.committee_id) || 0,
    member_id: Number(form.member_id) || 0,
    role: form.role,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const overlap = await checkCommitteeOverlap(
    c.env.DB,
    parsed.data.committee_id,
    parsed.data.member_id,
    parsed.data.term_start,
    parsed.data.term_end,
    id
  );
  if (overlap) {
    return render(c, form, ["同じ議員がこの委員会に既に所属している期間と重複しています"], id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE committee_memberships SET committee_id = ?, member_id = ?, role = ?, term_start = ?, term_end = ? WHERE id = ?`
  )
    .bind(parsed.data.committee_id, parsed.data.member_id, parsed.data.role, parsed.data.term_start, parsed.data.term_end, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "committee_memberships", id, "update");
  return c.redirect(withFlash("/admin/memberships", "updated"));
});

committeeMembershipsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM committee_memberships WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "committee_memberships", id, "delete");
  return c.redirect(withFlash("/admin/memberships", "deleted"));
});
