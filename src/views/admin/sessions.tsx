import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type SessionRow = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
};

export type SessionFormValues = {
  name: string;
  start_date: string;
  end_date: string;
};

export const emptySessionForm: SessionFormValues = { name: "", start_date: "", end_date: "" };

export const SessionsPage: FC<{
  rows: SessionRow[];
  form: SessionFormValues;
  errors: string[];
  editingId: number | null;
}> = ({ rows, form, errors, editingId }) => (
  <>
    <AdminSection title="定例会一覧">
      {rows.length === 0 ? (
        <p>登録された定例会はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>会期開始</th>
              <th>会期終了</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.name}</td>
                <td>{r.start_date}</td>
                <td>{r.end_date}</td>
                <td class="actions">
                  <a href={`/admin/sessions/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/sessions/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>

    <AdminSection title={editingId ? "定例会を編集" : "定例会を登録"}>
      <ErrorList errors={errors} />
      <form method="post" action={editingId ? `/admin/sessions/${editingId}` : "/admin/sessions"} class="admin-form">
        <div class="field">
          <label for="name">名称</label>
          <input type="text" id="name" name="name" value={form.name} required placeholder="例: 令和8年第1回定例会" />
        </div>
        <div class="field">
          <label for="start_date">会期開始</label>
          <input type="date" id="start_date" name="start_date" value={form.start_date} required />
        </div>
        <div class="field">
          <label for="end_date">会期終了</label>
          <input type="date" id="end_date" name="end_date" value={form.end_date} required />
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <a href="/admin/sessions" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
