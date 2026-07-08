import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList, Pagination } from "./shared";

export type FactionRow = { id: number; name: string; established_on: string; is_active: number };
export type FactionFormValues = { name: string; established_on: string; is_active: boolean };
export const emptyFactionForm: FactionFormValues = { name: "", established_on: "", is_active: true };

export const FactionsPage: FC<{
  rows: FactionRow[];
  form: FactionFormValues;
  errors: string[];
  editingId: number | null;
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}> = ({ rows, form, errors, editingId, page, totalPages, buildHref }) => (
  <>
    <AdminSection title="会派一覧">
      {rows.length === 0 ? (
        <p>登録された会派はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>会派名</th>
              <th>設置年月日</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.name}</td>
                <td>{r.established_on}</td>
                <td>{r.is_active ? "有効" : "廃止"}</td>
                <td class="actions">
                  <a href={`/admin/factions/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/factions/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </AdminSection>

    <AdminSection title={editingId ? "会派を編集" : "会派を登録"}>
      <ErrorList errors={errors} />
      <form method="post" action={editingId ? `/admin/factions/${editingId}` : "/admin/factions"} class="admin-form">
        <div class="field">
          <label for="name">会派名</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="established_on">設置年月日</label>
          <input type="date" id="established_on" name="established_on" value={form.established_on} required />
        </div>
        <div class="field checkbox-field">
          <input type="checkbox" id="is_active" name="is_active" checked={form.is_active} />
          <label for="is_active">有効</label>
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <a href="/admin/factions" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
