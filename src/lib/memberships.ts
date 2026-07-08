import type { Context } from "hono";
import type { AppEnv } from "../env";
import { logAdminMutation } from "./auditLog";
import { factionMembershipSchema, termsOverlap as factionTermsOverlap } from "../validators/factionMemberships";
import { committeeMembershipSchema, termsOverlap as committeeTermsOverlap } from "../validators/committeeMemberships";

export type MembershipResult = { ok: true; id: number } | { ok: false; errors: string[] };

/**
 * P2 §7 リスク対策: ハブ内フォームと既存の横断一覧画面(/admin/faction-memberships, /admin/memberships)で
 * バリデーション・重複チェック・INSERT ロジックが二重化しないよう、両方からこの関数群を呼ぶ。
 */

/** §8: 同一議員の会派所属期間の重複チェック(会派所属は member 単位。委員会と違い会派は問わない)。 */
export const checkFactionOverlap = async (
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
  return results.some((r) => factionTermsOverlap(termStart, termEnd, r.term_start, r.term_end));
};

export const createFactionMembership = async (
  c: Context<AppEnv>,
  input: { faction_id: number; member_id: number; term_start: string; term_end: string | null }
): Promise<MembershipResult> => {
  const parsed = factionMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const overlap = await checkFactionOverlap(
    c.env.DB,
    parsed.data.member_id,
    parsed.data.term_start,
    parsed.data.term_end,
    null
  );
  if (overlap) {
    return { ok: false, errors: ["この議員は同時に複数の会派に所属できません(既存の所属期間と重複しています)"] };
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO faction_memberships (faction_id, member_id, term_start, term_end) VALUES (?, ?, ?, ?)`
  )
    .bind(parsed.data.faction_id, parsed.data.member_id, parsed.data.term_start, parsed.data.term_end)
    .run();
  logAdminMutation(c, "faction_memberships", result.meta.last_row_id ?? null, "create");
  return { ok: true, id: result.meta.last_row_id as number };
};

/** P2-1「終了する」: term_end に本日日付をセットする1クリック操作。member_id も条件に含め他議員の行を誤って終了しない。 */
export const endFactionMembership = async (c: Context<AppEnv>, id: number, memberId: number): Promise<boolean> => {
  const result = await c.env.DB.prepare(
    `UPDATE faction_memberships SET term_end = date('now') WHERE id = ? AND member_id = ? AND term_end IS NULL`
  )
    .bind(id, memberId)
    .run();
  if (result.meta.changes === 0) return false;
  logAdminMutation(c, "faction_memberships", id, "update");
  return true;
};

/** §8: 同一議員×同一委員会の任期重複チェック。 */
export const checkCommitteeOverlap = async (
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
  return results.some((r) => committeeTermsOverlap(termStart, termEnd, r.term_start, r.term_end));
};

export const createCommitteeMembership = async (
  c: Context<AppEnv>,
  input: { committee_id: number; member_id: number; role: string; term_start: string; term_end: string | null }
): Promise<MembershipResult> => {
  const parsed = committeeMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const overlap = await checkCommitteeOverlap(
    c.env.DB,
    parsed.data.committee_id,
    parsed.data.member_id,
    parsed.data.term_start,
    parsed.data.term_end,
    null
  );
  if (overlap) {
    return { ok: false, errors: ["同じ議員がこの委員会に既に所属している期間と重複しています"] };
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO committee_memberships (committee_id, member_id, role, term_start, term_end) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(parsed.data.committee_id, parsed.data.member_id, parsed.data.role, parsed.data.term_start, parsed.data.term_end)
    .run();
  logAdminMutation(c, "committee_memberships", result.meta.last_row_id ?? null, "create");
  return { ok: true, id: result.meta.last_row_id as number };
};

/**
 * P2-1/P2-2「終了する」: 議員ハブ・委員会ハブの双方から呼ばれるため、member_id / committee_id
 * どちらか(あるいは両方)をスコープとして渡せるようにする。
 */
export const endCommitteeMembership = async (
  c: Context<AppEnv>,
  id: number,
  scope: { memberId?: number; committeeId?: number }
): Promise<boolean> => {
  const conditions = ["id = ?", "term_end IS NULL"];
  const binds: number[] = [id];
  if (scope.memberId !== undefined) {
    conditions.push("member_id = ?");
    binds.push(scope.memberId);
  }
  if (scope.committeeId !== undefined) {
    conditions.push("committee_id = ?");
    binds.push(scope.committeeId);
  }
  const result = await c.env.DB.prepare(
    `UPDATE committee_memberships SET term_end = date('now') WHERE ${conditions.join(" AND ")}`
  )
    .bind(...binds)
    .run();
  if (result.meta.changes === 0) return false;
  logAdminMutation(c, "committee_memberships", id, "update");
  return true;
};
