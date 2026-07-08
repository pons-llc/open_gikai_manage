import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList, Pagination } from "./shared";

export type AgendaTypeRow = { id: number; name: string; display_order: number };
export type AgendaTypeFormValues = { name: string; display_order: string };
export const emptyAgendaTypeForm: AgendaTypeFormValues = { name: "", display_order: "0" };

export const AgendaTypesPage: FC<{
  rows: AgendaTypeRow[];
  form: AgendaTypeFormValues;
  errors: string[];
  editingId: number | null;
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}> = ({ rows, form, errors, editingId, page, totalPages, buildHref }) => (
  <>
    <AdminSection title="議案種別一覧">
      {rows.length === 0 ? (
        <p>登録された議案種別はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>表示順</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.name}</td>
                <td>{r.display_order}</td>
                <td class="actions">
                  <a href={`/admin/agenda-types/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/agenda-types/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </AdminSection>

    <AdminSection title={editingId ? "議案種別を編集" : "議案種別を登録"}>
      <ErrorList errors={errors} />
      <form
        method="post"
        action={editingId ? `/admin/agenda-types/${editingId}` : "/admin/agenda-types"}
        class="admin-form"
      >
        <div class="field">
          <label for="name">名称</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="display_order">表示順</label>
          <input type="number" id="display_order" name="display_order" value={form.display_order} />
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <a href="/admin/agenda-types" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
