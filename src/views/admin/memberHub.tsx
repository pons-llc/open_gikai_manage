import type { FC } from "hono/jsx";
import { committeeMembershipRoles, committeeMembershipRoleLabels } from "../../validators/committeeMemberships";
import { AdminSection, DeleteForm, ErrorList } from "./shared";
import type { SelectOption } from "./committeeMemberships";
import type { MemberFormValues, MemberRow } from "./members";

export type MemberHubFactionRow = {
  id: number;
  faction_id: number;
  faction_name: string;
  term_start: string;
  term_end: string | null;
};

export type MemberHubCommitteeRow = {
  id: number;
  committee_id: number;
  committee_name: string;
  role: string;
  term_start: string;
  term_end: string | null;
};

/**
 * P2-1: 議員詳細ハブ。基本情報フォーム + 会派所属・委員会所属の履歴とその場追加フォームを1画面に同居させる。
 * 「編集」「削除」は既存の横断一覧(/admin/faction-memberships, /admin/memberships)へのリンクを再利用し、
 * ロジックを二重実装しない(§7)。
 */
export const MemberHubPage: FC<{
  member: MemberRow;
  form: MemberFormValues;
  errors: string[];
  factionMemberships: MemberHubFactionRow[];
  committeeMemberships: MemberHubCommitteeRow[];
  factions: SelectOption[];
  committees: SelectOption[];
  factionErrors: string[];
  committeeErrors: string[];
}> = ({
  member,
  form,
  errors,
  factionMemberships,
  committeeMemberships,
  factions,
  committees,
  factionErrors,
  committeeErrors,
}) => (
  <>
    <p>
      <a href="/admin/members">議員一覧に戻る</a>
    </p>

    <AdminSection title={`議員: ${member.name}`}>
      <ErrorList errors={errors} />
      <form method="post" action={`/admin/members/${member.id}`} class="admin-form">
        <div class="field">
          <label for="name">氏名</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="seat_number">議席番号</label>
          <input type="number" id="seat_number" name="seat_number" value={form.seat_number} required />
        </div>
        <div class="field">
          <label for="election_count">当選期</label>
          <input type="number" id="election_count" name="election_count" value={form.election_count} required />
        </div>
        <div class="field">
          <label for="elected_on">当選年月日</label>
          <input type="date" id="elected_on" name="elected_on" value={form.elected_on} required />
        </div>
        <div class="field checkbox-field">
          <input type="checkbox" id="is_active" name="is_active" checked={form.is_active} />
          <label for="is_active">現任</label>
        </div>
        <button type="submit" class="button button--primary">
          更新する
        </button>
      </form>
    </AdminSection>

    <AdminSection title="会派所属の履歴">
      <ErrorList errors={factionErrors} />
      {factionMemberships.length === 0 ? (
        <p>登録された会派所属はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>会派</th>
              <th>所属開始</th>
              <th>所属終了</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {factionMemberships.map((r) => (
              <tr>
                <td>{r.faction_name}</td>
                <td>{r.term_start}</td>
                <td>{r.term_end ?? "現所属"}</td>
                <td class="actions">
                  {!r.term_end && (
                    <form
                      method="post"
                      action={`/admin/members/${member.id}/faction-memberships/${r.id}/end`}
                      class="inline-form"
                      data-confirm="本日付で所属を終了しますか?"
                    >
                      <button type="submit" class="button button--danger">
                        終了する
                      </button>
                    </form>
                  )}{" "}
                  <a href={`/admin/faction-memberships/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/faction-memberships/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>会派所属を追加</h3>
      <form method="post" action={`/admin/members/${member.id}/faction-memberships`} class="admin-form">
        <div class="field">
          <label for="hub_faction_id">会派</label>
          <select id="hub_faction_id" name="faction_id" required>
            <option value="">選択してください</option>
            {factions.map((f) => (
              <option value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hub_faction_term_start">所属開始</label>
          <input type="date" id="hub_faction_term_start" name="term_start" required />
        </div>
        <button type="submit" class="button button--primary">
          追加する
        </button>
      </form>
      <p class="hint">
        <a href="/admin/faction-memberships">会派所属の横断一覧を見る</a>
      </p>
    </AdminSection>

    <AdminSection title="委員会所属の履歴">
      <ErrorList errors={committeeErrors} />
      {committeeMemberships.length === 0 ? (
        <p>登録された委員会所属はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>委員会</th>
              <th>役職</th>
              <th>任期開始</th>
              <th>任期終了</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {committeeMemberships.map((r) => (
              <tr>
                <td>{r.committee_name}</td>
                <td>{committeeMembershipRoleLabels[r.role as keyof typeof committeeMembershipRoleLabels] ?? r.role}</td>
                <td>{r.term_start}</td>
                <td>{r.term_end ?? "現任"}</td>
                <td class="actions">
                  {!r.term_end && (
                    <form
                      method="post"
                      action={`/admin/members/${member.id}/committee-memberships/${r.id}/end`}
                      class="inline-form"
                      data-confirm="本日付で任期を終了しますか?"
                    >
                      <button type="submit" class="button button--danger">
                        終了する
                      </button>
                    </form>
                  )}{" "}
                  <a href={`/admin/memberships/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/memberships/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>委員会所属を追加</h3>
      <form method="post" action={`/admin/members/${member.id}/committee-memberships`} class="admin-form">
        <div class="field">
          <label for="hub_committee_id">委員会</label>
          <select id="hub_committee_id" name="committee_id" required>
            <option value="">選択してください</option>
            {committees.map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hub_committee_role">役職</label>
          <select id="hub_committee_role" name="role">
            {committeeMembershipRoles.map((r) => (
              <option value={r} selected={r === "member"}>
                {committeeMembershipRoleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hub_committee_term_start">任期開始</label>
          <input type="date" id="hub_committee_term_start" name="term_start" required />
        </div>
        <button type="submit" class="button button--primary">
          追加する
        </button>
      </form>
      <p class="hint">
        <a href="/admin/memberships">委員会所属の横断一覧を見る</a>
      </p>
    </AdminSection>
  </>
);
