import type { FC } from "hono/jsx";
import { committeeMembershipRoles, committeeMembershipRoleLabels } from "../../validators/committeeMemberships";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type CommitteeMembershipRow = {
  id: number;
  committee_id: number;
  committee_name: string;
  member_id: number;
  member_name: string;
  role: string;
  term_start: string;
  term_end: string | null;
};

export type SelectOption = { id: number; name: string };

export type CommitteeMembershipFormValues = {
  committee_id: string;
  member_id: string;
  role: string;
  term_start: string;
  term_end: string;
};

export const emptyCommitteeMembershipForm: CommitteeMembershipFormValues = {
  committee_id: "",
  member_id: "",
  role: "member",
  term_start: "",
  term_end: "",
};

export const CommitteeMembershipsPage: FC<{
  rows: CommitteeMembershipRow[];
  committees: SelectOption[];
  members: SelectOption[];
  form: CommitteeMembershipFormValues;
  errors: string[];
  editingId: number | null;
}> = ({ rows, committees, members, form, errors, editingId }) => (
  <>
    <AdminSection title="委員会所属一覧">
      {rows.length === 0 ? (
        <p>登録された委員会所属はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>委員会</th>
              <th>議員</th>
              <th>役職</th>
              <th>任期開始</th>
              <th>任期終了</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.committee_name}</td>
                <td>{r.member_name}</td>
                <td>{committeeMembershipRoleLabels[r.role as keyof typeof committeeMembershipRoleLabels] ?? r.role}</td>
                <td>{r.term_start}</td>
                <td>{r.term_end ?? "現任"}</td>
                <td class="actions">
                  <a href={`/admin/memberships/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/memberships/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>

    <AdminSection title={editingId ? "委員会所属を編集" : "委員会所属を登録"}>
      <ErrorList errors={errors} />
      <form
        method="post"
        action={editingId ? `/admin/memberships/${editingId}` : "/admin/memberships"}
        class="admin-form"
      >
        <div class="field">
          <label for="committee_id">委員会</label>
          <select id="committee_id" name="committee_id" required>
            <option value="">選択してください</option>
            {committees.map((c) => (
              <option value={c.id} selected={String(c.id) === form.committee_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="member_id">議員</label>
          <select id="member_id" name="member_id" required>
            <option value="">選択してください</option>
            {members.map((m) => (
              <option value={m.id} selected={String(m.id) === form.member_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="role">役職</label>
          <select id="role" name="role">
            {committeeMembershipRoles.map((r) => (
              <option value={r} selected={r === form.role}>
                {committeeMembershipRoleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="term_start">任期開始</label>
          <input type="date" id="term_start" name="term_start" value={form.term_start} required />
        </div>
        <div class="field">
          <label for="term_end">任期終了(空欄 = 現任)</label>
          <input type="date" id="term_end" name="term_end" value={form.term_end} />
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {!editingId && (
          <button type="submit" name="save_mode" value="continue" class="button button--secondary" style="margin-left: 0.5rem;">
            登録して続けて入力
          </button>
        )}
        {editingId && (
          <a href="/admin/memberships" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
