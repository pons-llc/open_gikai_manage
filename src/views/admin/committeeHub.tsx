import type { FC } from "hono/jsx";
import { committeeMembershipRoles, committeeMembershipRoleLabels } from "../../validators/committeeMemberships";
import { committeeCategories, committeeCategoryLabels } from "../../validators/committees";
import { AdminSection, DeleteForm, ErrorList } from "./shared";
import type { CommitteeFormValues, CommitteeRow } from "./committees";
import type { SelectOption } from "./committeeMemberships";

export type CommitteeHubMembershipRow = {
  id: number;
  member_id: number;
  member_name: string;
  seat_number: number;
  role: string;
  term_start: string;
  term_end: string | null;
};

/** P2-2: 委員会詳細ハブ。基本情報フォーム + 現在の委員構成(role 順)+ 過去の委員(折りたたみ)。 */
export const CommitteeHubPage: FC<{
  committee: CommitteeRow;
  form: CommitteeFormValues;
  errors: string[];
  current: CommitteeHubMembershipRow[];
  past: CommitteeHubMembershipRow[];
  members: SelectOption[];
  membershipErrors: string[];
}> = ({ committee, form, errors, current, past, members, membershipErrors }) => (
  <>
    <p>
      <a href="/admin/committees">委員会一覧に戻る</a>
    </p>

    <AdminSection title={`委員会: ${committee.name}`}>
      <ErrorList errors={errors} />
      <form method="post" action={`/admin/committees/${committee.id}`} class="admin-form">
        <div class="field">
          <label for="name">委員会名</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="category">区分</label>
          <select id="category" name="category">
            {committeeCategories.map((c) => (
              <option value={c} selected={c === form.category}>
                {committeeCategoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="display_order">表示順</label>
          <input type="number" id="display_order" name="display_order" value={form.display_order} required />
        </div>
        <div class="field checkbox-field">
          <input type="checkbox" id="is_active" name="is_active" checked={form.is_active} />
          <label for="is_active">活動中</label>
        </div>
        <button type="submit" class="button button--primary">
          更新する
        </button>
      </form>
    </AdminSection>

    <AdminSection title="現在の委員構成">
      <ErrorList errors={membershipErrors} />
      {current.length === 0 ? (
        <p>現任の委員はいません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>議員</th>
              <th>役職</th>
              <th>任期開始</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {current.map((r) => (
              <tr>
                <td>{r.member_name}</td>
                <td>{committeeMembershipRoleLabels[r.role as keyof typeof committeeMembershipRoleLabels] ?? r.role}</td>
                <td>{r.term_start}</td>
                <td class="actions">
                  <form
                    method="post"
                    action={`/admin/committees/${committee.id}/committee-memberships/${r.id}/end`}
                    class="inline-form"
                    data-confirm="本日付で任期を終了しますか?"
                  >
                    <button type="submit" class="button button--danger">
                      任期を終了する
                    </button>
                  </form>{" "}
                  <a href={`/admin/memberships/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/memberships/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>委員を追加</h3>
      <form method="post" action={`/admin/committees/${committee.id}/committee-memberships`} class="admin-form">
        <div class="field">
          <label for="hub_member_id">議員</label>
          <select id="hub_member_id" name="member_id" required>
            <option value="">選択してください</option>
            {members.map((m) => (
              <option value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hub_role">役職</label>
          <select id="hub_role" name="role">
            {committeeMembershipRoles.map((r) => (
              <option value={r} selected={r === "member"}>
                {committeeMembershipRoleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="hub_term_start">任期開始</label>
          <input type="date" id="hub_term_start" name="term_start" required />
        </div>
        <button type="submit" class="button button--primary">
          追加する
        </button>
      </form>
    </AdminSection>

    {past.length > 0 && (
      <AdminSection title="過去の委員">
        <details>
          <summary>{past.length}件を表示</summary>
          <table class="admin-table">
            <thead>
              <tr>
                <th>議員</th>
                <th>役職</th>
                <th>任期開始</th>
                <th>任期終了</th>
              </tr>
            </thead>
            <tbody>
              {past.map((r) => (
                <tr>
                  <td>{r.member_name}</td>
                  <td>{committeeMembershipRoleLabels[r.role as keyof typeof committeeMembershipRoleLabels] ?? r.role}</td>
                  <td>{r.term_start}</td>
                  <td>{r.term_end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </AdminSection>
    )}

    <p class="hint">
      <a href="/admin/memberships">委員会所属の横断一覧を見る</a>
    </p>
  </>
);
