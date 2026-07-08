import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { checkboxOn, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { createCommitteeMembership, endCommitteeMembership } from "../../lib/memberships";
import { committeeSchema } from "../../validators/committees";
import { Layout } from "../../views/layout";
import {
  CommitteesPage,
  emptyCommitteeForm,
  type CommitteeFormValues,
  type CommitteeRow,
} from "../../views/admin/committees";
import { CommitteeHubPage, type CommitteeHubMembershipRow } from "../../views/admin/committeeHub";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const committeesRoute = new Hono<AppEnv>();

const ROLE_ORDER: Record<string, number> = { chair: 0, vice_chair: 1, member: 2 };

const listCommittees = (DB: D1Database) =>
  DB.prepare(`SELECT id, name, category, display_order, is_active FROM committees ORDER BY display_order ASC, id ASC`)
    .all<CommitteeRow>()
    .then((r) => r.results);

const loadCommittee = (DB: D1Database, id: number) =>
  DB.prepare(`SELECT id, name, category, display_order, is_active FROM committees WHERE id = ?`)
    .bind(id)
    .first<CommitteeRow>();

const listCommitteeMemberships = (DB: D1Database, committeeId: number) =>
  DB.prepare(
    `SELECT cm.id, cm.member_id, m.name AS member_name, m.seat_number, cm.role, cm.term_start, cm.term_end
     FROM committee_memberships cm JOIN members m ON m.id = cm.member_id
     WHERE cm.committee_id = ?`
  )
    .bind(committeeId)
    .all<CommitteeHubMembershipRow>()
    .then((r) => r.results);

const listMemberOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM members ORDER BY seat_number ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

/** P2-2: 委員会詳細ハブ。基本情報フォーム + 現在の委員構成(role 順)+ 過去の委員(折りたたみ)。 */
const renderCommitteeHub = async (
  c: Context<AppEnv>,
  committeeId: number,
  options: { committeeErrors?: string[]; membershipErrors?: string[]; status?: 200 | 400; flash?: FlashKind } = {}
) => {
  const committee = await loadCommittee(c.env.DB, committeeId);
  if (!committee) return c.notFound();
  const [rows, members] = await Promise.all([
    listCommitteeMemberships(c.env.DB, committeeId),
    listMemberOptions(c.env.DB),
  ]);
  const current = rows
    .filter((r) => !r.term_end)
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.seat_number - b.seat_number);
  const past = rows.filter((r) => r.term_end).sort((a, b) => (b.term_end as string).localeCompare(a.term_end as string));
  return c.html(
    <Layout title={`委員会: ${committee.name}`} variant="admin" adminEmail={c.get("adminEmail")} flash={options.flash}>
      <CommitteeHubPage
        committee={committee}
        form={{
          name: committee.name,
          category: committee.category,
          display_order: String(committee.display_order),
          is_active: !!committee.is_active,
        }}
        errors={options.committeeErrors ?? []}
        current={current}
        past={past}
        members={members}
        membershipErrors={options.membershipErrors ?? []}
      />
    </Layout>,
    options.status ?? 200
  );
};

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
  status: 200 | 400 = 200,
  flash?: FlashKind
) => {
  const rows = await listCommittees(c.env.DB);
  return c.html(
    <Layout title="委員会管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <CommitteesPage rows={rows} form={form} errors={errors} editingId={editingId} />
    </Layout>,
    status
  );
};

committeesRoute.get("/", async (c) => render(c, emptyCommitteeForm, [], null, 200, getFlash(c)));

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

/** P2-2: 委員会詳細ハブ。委員会一覧の「編集」リンクはここへ変更する。 */
committeesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  return renderCommitteeHub(c, id, { flash: getFlash(c) });
});

committeesRoute.post("/:id/committee-memberships", async (c) => {
  const committeeId = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const result = await createCommitteeMembership(c, {
    committee_id: committeeId,
    member_id: Number(str(form, "member_id")) || 0,
    role: str(form, "role") || "member",
    term_start: str(form, "term_start"),
    term_end: null,
  });
  if (!result.ok) {
    return renderCommitteeHub(c, committeeId, { membershipErrors: result.errors, status: 400 });
  }
  return c.redirect(withFlash(`/admin/committees/${committeeId}`, "created"));
});

committeesRoute.post("/:id/committee-memberships/:mid/end", async (c) => {
  const committeeId = Number(c.req.param("id"));
  const mid = Number(c.req.param("mid"));
  await endCommitteeMembership(c, mid, { committeeId });
  return c.redirect(withFlash(`/admin/committees/${committeeId}`, "updated"));
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
  return c.redirect(withFlash("/admin/committees", "created"));
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
  return c.redirect(withFlash(`/admin/committees/${id}`, "updated"));
});

committeesRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM committees WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyCommitteeForm, ["使用中のため削除できません(委員会所属・日程・議題などで参照されています)"], null, 400);
  }
  logAdminMutation(c, "committees", id, "delete");
  return c.redirect(withFlash("/admin/committees", "deleted"));
});
