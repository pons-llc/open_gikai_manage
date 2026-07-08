import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { checkboxOn, formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { createCommitteeMembership, createFactionMembership, endCommitteeMembership, endFactionMembership } from "../../lib/memberships";
import { memberSchema } from "../../validators/members";
import { Layout } from "../../views/layout";
import {
  MembersPage,
  emptyMemberForm,
  type MemberFormValues,
  type MemberRow,
} from "../../views/admin/members";
import {
  MemberHubPage,
  type MemberHubCommitteeRow,
  type MemberHubFactionRow,
} from "../../views/admin/memberHub";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const membersRoute = new Hono<AppEnv>();

const listMembers = (DB: D1Database, page: number) =>
  DB.prepare(
    `SELECT id, name, election_count, elected_on, seat_number, is_active FROM members ORDER BY seat_number ASC LIMIT ? OFFSET ?`
  )
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<MemberRow>()
    .then((r) => r.results);

const countMembers = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM members`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

const readForm = (form: ParsedForm): MemberFormValues => ({
  name: str(form, "name"),
  election_count: str(form, "election_count") || "1",
  elected_on: str(form, "elected_on"),
  seat_number: str(form, "seat_number") || "1",
  is_active: checkboxOn(form, "is_active"),
});

const loadMember = (DB: D1Database, id: number) =>
  DB.prepare(`SELECT id, name, election_count, elected_on, seat_number, is_active FROM members WHERE id = ?`)
    .bind(id)
    .first<MemberRow>();

const listMemberFactionMemberships = (DB: D1Database, memberId: number) =>
  DB.prepare(
    `SELECT fm.id, fm.faction_id, f.name AS faction_name, fm.term_start, fm.term_end
     FROM faction_memberships fm JOIN factions f ON f.id = fm.faction_id
     WHERE fm.member_id = ? ORDER BY fm.term_start DESC, fm.id DESC`
  )
    .bind(memberId)
    .all<MemberHubFactionRow>()
    .then((r) => r.results);

const listMemberCommitteeMemberships = (DB: D1Database, memberId: number) =>
  DB.prepare(
    `SELECT cm.id, cm.committee_id, c.name AS committee_name, cm.role, cm.term_start, cm.term_end
     FROM committee_memberships cm JOIN committees c ON c.id = cm.committee_id
     WHERE cm.member_id = ? ORDER BY cm.term_start DESC, cm.id DESC`
  )
    .bind(memberId)
    .all<MemberHubCommitteeRow>()
    .then((r) => r.results);

const listFactionOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM factions ORDER BY established_on ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listCommitteeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM committees WHERE is_active = 1 ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

/** P2-1: 議員詳細ハブ。基本情報フォーム+会派所属・委員会所属の履歴とその場追加フォームを1画面に描画する。 */
const renderMemberHub = async (
  c: Context<AppEnv>,
  memberId: number,
  options: {
    memberErrors?: string[];
    factionErrors?: string[];
    committeeErrors?: string[];
    status?: 200 | 400;
    flash?: FlashKind;
  } = {}
) => {
  const member = await loadMember(c.env.DB, memberId);
  if (!member) return c.notFound();
  const [factionMemberships, committeeMemberships, factions, committees] = await Promise.all([
    listMemberFactionMemberships(c.env.DB, memberId),
    listMemberCommitteeMemberships(c.env.DB, memberId),
    listFactionOptions(c.env.DB),
    listCommitteeOptions(c.env.DB),
  ]);
  return c.html(
    <Layout title={`議員: ${member.name}`} variant="admin" adminEmail={c.get("adminEmail")} flash={options.flash}>
      <MemberHubPage
        member={member}
        form={{
          name: member.name,
          election_count: String(member.election_count),
          elected_on: member.elected_on,
          seat_number: String(member.seat_number),
          is_active: !!member.is_active,
        }}
        errors={options.memberErrors ?? []}
        factionMemberships={factionMemberships}
        committeeMemberships={committeeMemberships}
        factions={factions}
        committees={committees}
        factionErrors={options.factionErrors ?? []}
        committeeErrors={options.committeeErrors ?? []}
      />
    </Layout>,
    options.status ?? 200
  );
};

const render = async (
  c: Context<AppEnv>,
  form: MemberFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, count] = await Promise.all([listMembers(c.env.DB, page), countMembers(c.env.DB)]);
  return c.html(
    <Layout title="議員管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <MembersPage
        rows={rows}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/members", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

/** P1-2: 同期の議員をまとめて登録する場合に当選期・当選年月日を引き継ぐ。 */
membersRoute.get("/", async (c) => {
  const form = formFromQuery(emptyMemberForm, c.req.query(), ["elected_on", "election_count"]);
  return render(c, form, [], null, 200, getFlash(c), parsePage(c.req.query("page")));
});

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

/** P2-1: 議員詳細ハブ。議員一覧の「編集」リンクはここへ変更する。 */
membersRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  return renderMemberHub(c, id, { flash: getFlash(c) });
});

membersRoute.post("/:id/faction-memberships", async (c) => {
  const memberId = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const result = await createFactionMembership(c, {
    faction_id: Number(str(form, "faction_id")) || 0,
    member_id: memberId,
    term_start: str(form, "term_start"),
    term_end: null,
  });
  if (!result.ok) {
    return renderMemberHub(c, memberId, { factionErrors: result.errors, status: 400 });
  }
  return c.redirect(withFlash(`/admin/members/${memberId}`, "created"));
});

membersRoute.post("/:id/faction-memberships/:mid/end", async (c) => {
  const memberId = Number(c.req.param("id"));
  const mid = Number(c.req.param("mid"));
  await endFactionMembership(c, mid, memberId);
  return c.redirect(withFlash(`/admin/members/${memberId}`, "updated"));
});

membersRoute.post("/:id/committee-memberships", async (c) => {
  const memberId = Number(c.req.param("id"));
  const form = await c.req.parseBody();
  const result = await createCommitteeMembership(c, {
    committee_id: Number(str(form, "committee_id")) || 0,
    member_id: memberId,
    role: str(form, "role") || "member",
    term_start: str(form, "term_start"),
    term_end: null,
  });
  if (!result.ok) {
    return renderMemberHub(c, memberId, { committeeErrors: result.errors, status: 400 });
  }
  return c.redirect(withFlash(`/admin/members/${memberId}`, "created"));
});

membersRoute.post("/:id/committee-memberships/:mid/end", async (c) => {
  const memberId = Number(c.req.param("id"));
  const mid = Number(c.req.param("mid"));
  await endCommitteeMembership(c, mid, { memberId });
  return c.redirect(withFlash(`/admin/members/${memberId}`, "updated"));
});

membersRoute.post("/", async (c) => {
  const rawForm = await c.req.parseBody();
  const form = readForm(rawForm);
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
  if (str(rawForm, "save_mode") === "continue") {
    return c.redirect(
      withFlash("/admin/members", "created", {
        elected_on: parsed.data.elected_on,
        election_count: String(parsed.data.election_count),
      })
    );
  }
  return c.redirect(withFlash("/admin/members", "created"));
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
  return c.redirect(withFlash(`/admin/members/${id}`, "updated"));
});

membersRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM members WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyMemberForm, ["使用中のため削除できません(委員会所属・会派所属で参照されています)"], null, 400);
  }
  logAdminMutation(c, "members", id, "delete");
  return c.redirect(withFlash("/admin/members", "deleted"));
});
