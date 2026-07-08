import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList, Pagination } from "./shared";
import type { SelectOption } from "./committeeMemberships";

export type FactionMembershipRow = {
  id: number;
  faction_id: number;
  faction_name: string;
  member_id: number;
  member_name: string;
  term_start: string;
  term_end: string | null;
};

export type FactionMembershipFormValues = {
  faction_id: string;
  member_id: string;
  term_start: string;
  term_end: string;
};

export const emptyFactionMembershipForm: FactionMembershipFormValues = {
  faction_id: "",
  member_id: "",
  term_start: "",
  term_end: "",
};

export const FactionMembershipsPage: FC<{
  rows: FactionMembershipRow[];
  factions: SelectOption[];
  members: SelectOption[];
  form: FactionMembershipFormValues;
  errors: string[];
  editingId: number | null;
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}> = ({ rows, factions, members, form, errors, editingId, page, totalPages, buildHref }) => (
  <>
    <AdminSection title="会派所属一覧">
      {rows.length === 0 ? (
        <p>登録された会派所属はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>会派</th>
              <th>議員</th>
              <th>所属開始</th>
              <th>所属終了</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.faction_name}</td>
                <td>{r.member_name}</td>
                <td>{r.term_start}</td>
                <td>{r.term_end ?? "現所属"}</td>
                <td class="actions">
                  <a href={`/admin/faction-memberships/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/faction-memberships/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </AdminSection>

    <AdminSection title={editingId ? "会派所属を編集" : "会派所属を登録"}>
      <ErrorList errors={errors} />
      <form
        method="post"
        action={editingId ? `/admin/faction-memberships/${editingId}` : "/admin/faction-memberships"}
        class="admin-form"
      >
        <div class="field">
          <label for="faction_id">会派</label>
          <select id="faction_id" name="faction_id" required>
            <option value="">選択してください</option>
            {factions.map((f) => (
              <option value={f.id} selected={String(f.id) === form.faction_id}>
                {f.name}
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
          <label for="term_start">所属開始</label>
          <input type="date" id="term_start" name="term_start" value={form.term_start} required />
        </div>
        <div class="field">
          <label for="term_end">所属終了(空欄 = 現所属)</label>
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
          <a href="/admin/faction-memberships" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
