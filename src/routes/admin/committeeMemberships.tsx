import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { committeeMembershipSchema, termsOverlap } from "../../validators/committeeMemberships";
import { Layout } from "../../views/layout";
import {
  CommitteeMembershipsPage,
  emptyCommitteeMembershipForm,
  type CommitteeMembershipFormValues,
  type CommitteeMembershipRow,
  type SelectOption,
} from "../../views/admin/committeeMemberships";

export const committeeMembershipsRoute = new Hono<AppEnv>();

const listMemberships = (DB: D1Database) =>
  DB.prepare(
    `SELECT cm.id, cm.committee_id, c.name AS committee_name, cm.member_id, m.name AS member_name,
            cm.role, cm.term_start, cm.term_end
     FROM committee_memberships cm
     JOIN committees c ON c.id = cm.committee_id
     JOIN members m ON m.id = cm.member_id
     ORDER BY cm.term_start DESC, cm.id DESC`
  )
    .all<CommitteeMembershipRow>()
    .then((r) => r.results);

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
  flash?: FlashKind
) => {
  const [rows, committees, members] = await Promise.all([
    listMemberships(c.env.DB),
    listCommitteeOptions(c.env.DB),
    listMemberOptions(c.env.DB),
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
      />
    </Layout>,
    status
  );
};

/** 同一議員×同一委員会の任期重複チェック(§8)。editingId は自分自身を除外するため。 */
const checkOverlap = async (
  DB: D1Database,
  committeeId: number,
  memberId: number,
  termStart: string,
  termEnd: string | null,
  editingId: number | null
): Promise<boolean> => {
  const { results } = await DB.prepare(
    `SELECT term_start, term_end FROM committee_memberships WHERE committee_id = ? AND member_id = ? AND id != ?`
  )
    .bind(committeeId, memberId, editingId ?? -1)
    .all<{ term_start: string; term_end: string | null }>();
  return results.some((r) => termsOverlap(termStart, termEnd, r.term_start, r.term_end));
};

/** P1-2: 委員会所属を続けて入力する場合、委員会・役職(=委員に戻す)・任期開始を引き継ぐ。 */
committeeMembershipsRoute.get("/", async (c) => {
  const form = formFromQuery(emptyCommitteeMembershipForm, c.req.query(), ["committee_id", "role", "term_start"]);
  return render(c, form, [], null, 200, getFlash(c));
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
  const parsed = committeeMembershipSchema.safeParse({
    committee_id: Number(form.committee_id) || 0,
    member_id: Number(form.member_id) || 0,
    role: form.role,
    term_start: form.term_start,
    term_end: form.term_end === "" ? null : form.term_end,
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const overlap = await checkOverlap(
    c.env.DB,
    parsed.data.committee_id,
    parsed.data.member_id,
    parsed.data.term_start,
    parsed.data.term_end,
    null
  );
  if (overlap) {
    return render(c, form, ["同じ議員がこの委員会に既に所属している期間と重複しています"], null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO committee_memberships (committee_id, member_id, role, term_start, term_end) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(parsed.data.committee_id, parsed.data.member_id, parsed.data.role, parsed.data.term_start, parsed.data.term_end)
    .run();
  logAdminMutation(c, "committee_memberships", result.meta.last_row_id ?? null, "create");
  if (str(rawForm, "save_mode") === "continue") {
    // §3-1: 連続登録では役職を都度選び直させず「委員」に戻す(委員長・副委員長は通常1人ずつのため)。
    return c.redirect(
      withFlash("/admin/memberships", "created", {
        committee_id: String(parsed.data.committee_id),
        role: "member",
        term_start: parsed.data.term_start,
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
  const overlap = await checkOverlap(
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
