import type { FC } from "hono/jsx";
import { committeeCategories, committeeCategoryLabels } from "../../validators/committees";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type CommitteeRow = {
  id: number;
  name: string;
  category: string;
  display_order: number;
  is_active: number;
};

export type CommitteeFormValues = {
  name: string;
  category: string;
  display_order: string;
  is_active: boolean;
};

export const emptyCommitteeForm: CommitteeFormValues = {
  name: "",
  category: "standing",
  display_order: "0",
  is_active: true,
};

export const CommitteesPage: FC<{
  rows: CommitteeRow[];
  form: CommitteeFormValues;
  errors: string[];
  editingId: number | null;
}> = ({ rows, form, errors, editingId }) => (
  <>
    <AdminSection title="委員会一覧">
      {rows.length === 0 ? (
        <p>登録された委員会はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>種別</th>
              <th>表示順</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.name}</td>
                <td>{committeeCategoryLabels[r.category as keyof typeof committeeCategoryLabels] ?? r.category}</td>
                <td>{r.display_order}</td>
                <td>{r.is_active ? "有効" : "廃止"}</td>
                <td class="actions">
                  <a href={`/admin/committees/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/committees/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>

    <AdminSection title={editingId ? "委員会を編集" : "委員会を登録"}>
      <ErrorList errors={errors} />
      <form method="post" action={editingId ? `/admin/committees/${editingId}` : "/admin/committees"} class="admin-form">
        <div class="field">
          <label for="name">名称</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="category">種別</label>
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
          <input type="number" id="display_order" name="display_order" value={form.display_order} />
        </div>
        <div class="field checkbox-field">
          <input type="checkbox" id="is_active" name="is_active" checked={form.is_active} />
          <label for="is_active">有効</label>
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <a href="/admin/committees" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
