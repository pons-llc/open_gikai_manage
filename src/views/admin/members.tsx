import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type MemberRow = {
  id: number;
  name: string;
  election_count: number;
  elected_on: string;
  seat_number: number;
  is_active: number;
};

export type MemberFormValues = {
  name: string;
  election_count: string;
  elected_on: string;
  seat_number: string;
  is_active: boolean;
};

export const emptyMemberForm: MemberFormValues = {
  name: "",
  election_count: "1",
  elected_on: "",
  seat_number: "1",
  is_active: true,
};

export const MembersPage: FC<{
  rows: MemberRow[];
  form: MemberFormValues;
  errors: string[];
  editingId: number | null;
}> = ({ rows, form, errors, editingId }) => (
  <>
    <AdminSection title="議員一覧">
      {rows.length === 0 ? (
        <p>登録された議員はいません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>議席番号</th>
              <th>氏名</th>
              <th>当選期</th>
              <th>当選年月日</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.seat_number}</td>
                <td>{r.name}</td>
                <td>{r.election_count}</td>
                <td>{r.elected_on}</td>
                <td>{r.is_active ? "現任" : "任期満了/辞職"}</td>
                <td class="actions">
                  <a href={`/admin/members/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/members/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>

    <AdminSection title={editingId ? "議員を編集" : "議員を登録"}>
      <ErrorList errors={errors} />
      <form method="post" action={editingId ? `/admin/members/${editingId}` : "/admin/members"} class="admin-form">
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
          {editingId ? "更新する" : "登録する"}
        </button>
        {!editingId && (
          <button type="submit" name="save_mode" value="continue" class="button button--secondary" style="margin-left: 0.5rem;">
            登録して続けて入力
          </button>
        )}
        {editingId && (
          <a href="/admin/members" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
