import type { FC } from "hono/jsx";
import { agendaItemCategories, agendaItemCategoryLabels, type AgendaItemSort } from "../../validators/agendaItems";
import type { SelectOption } from "./committeeMemberships";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type AgendaItemRow = {
  id: number;
  title: string;
  fiscal_year: number;
  number: number;
  category: string;
  published_at: string;
  is_reserved: number;
};

export type AgendaItemDocumentRow = { id: number; file_name: string; file_size: number };

const SORT_LABELS: Record<AgendaItemSort, string> = {
  fiscal_year_desc: "年度が新しい順",
  fiscal_year_asc: "年度が古い順",
  number_desc: "番号が大きい順",
  number_asc: "番号が小さい順",
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export type AgendaItemFormValues = {
  title: string;
  fiscal_year: string;
  number: string;
  category: string;
  agenda_type_id: string;
  committee_id: string;
  published_at_local: string;
};

export const emptyAgendaItemForm: AgendaItemFormValues = {
  title: "",
  fiscal_year: String(new Date().getFullYear()),
  number: "",
  category: "bill",
  agenda_type_id: "",
  committee_id: "",
  published_at_local: "",
};

export const AgendaItemsPage: FC<{
  rows: AgendaItemRow[];
  years: number[];
  filter: { year: string; category: string; sort: AgendaItemSort };
  agendaTypes: SelectOption[];
  committees: SelectOption[];
  form: AgendaItemFormValues;
  errors: string[];
  editingId: number | null;
  documents: AgendaItemDocumentRow[];
}> = ({ rows, years, filter, agendaTypes, committees, form, errors, editingId, documents }) => (
  <>
    <div class="admin-header-note">公開サイトへの反映には最大30分かかります(design.md §9.1)。</div>

    <AdminSection title="議題一覧">
      <form method="get" class="search-form">
        <label>
          年度
          <select name="fiscal_year">
            <option value="" selected={filter.year === ""}>
              すべて
            </option>
            {years.map((y) => (
              <option value={y} selected={String(y) === filter.year}>
                {y}年度
              </option>
            ))}
          </select>
        </label>
        <label>
          種類
          <select name="category">
            <option value="" selected={filter.category === ""}>
              すべて
            </option>
            {agendaItemCategories.map((c) => (
              <option value={c} selected={c === filter.category}>
                {agendaItemCategoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          並べ替え
          <select name="sort">
            {(Object.keys(SORT_LABELS) as AgendaItemSort[]).map((key) => (
              <option value={key} selected={key === filter.sort}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" class="button button--primary">
          絞り込む
        </button>
      </form>
      {rows.length === 0 ? (
        <p>登録された議題はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>年度</th>
              <th>番号</th>
              <th>種類</th>
              <th>議題名</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.fiscal_year}</td>
                <td>{r.number}</td>
                <td>{agendaItemCategoryLabels[r.category as keyof typeof agendaItemCategoryLabels] ?? r.category}</td>
                <td>{r.title}</td>
                <td>{r.is_reserved ? <span class="badge badge--reserved">予約中</span> : "公開済み"}</td>
                <td class="actions">
                  <a href={`/admin/agenda-items/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/agenda-items/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>

    <AdminSection title={editingId ? "議題を編集" : "議題を登録"}>
      <ErrorList errors={errors} />
      <form
        method="post"
        action={editingId ? `/admin/agenda-items/${editingId}` : "/admin/agenda-items"}
        class="admin-form"
        data-agenda-item-form
      >
        <div class="field">
          <label for="title">議題名</label>
          <input type="text" id="title" name="title" value={form.title} required />
        </div>
        <div class="field">
          <label for="fiscal_year">年度</label>
          <input type="number" id="fiscal_year" name="fiscal_year" value={form.fiscal_year} required />
        </div>
        <div class="field">
          <label for="number">番号</label>
          <input type="number" id="number" name="number" value={form.number} required />
        </div>
        <div class="field">
          <label for="category">種類</label>
          <select id="category" name="category" data-agenda-item-category>
            {agendaItemCategories.map((c) => (
              <option value={c} selected={c === form.category}>
                {agendaItemCategoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div class="field" data-agenda-item-field="bill">
          <label for="agenda_type_id">議案種別(種類が「議案」のときのみ)</label>
          <select id="agenda_type_id" name="agenda_type_id">
            <option value="">選択してください</option>
            {agendaTypes.map((t) => (
              <option value={t.id} selected={String(t.id) === form.agenda_type_id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field" data-agenda-item-field="committee">
          <label for="committee_id">委員会(種類が「委員会」のときのみ)</label>
          <select id="committee_id" name="committee_id">
            <option value="">選択してください</option>
            {committees.map((c) => (
              <option value={c.id} selected={String(c.id) === form.committee_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="published_at_local">予定公開日時(空欄 = 即時公開)</label>
          <input
            type="datetime-local"
            id="published_at_local"
            name="published_at_local"
            value={form.published_at_local}
          />
          <p class="hint">30分キャッシュのため、実際の公開はこの時刻から最大30分遅れます(§3.4)。</p>
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
          <a href="/admin/agenda-items" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>

    {editingId && (
      <AdminSection title="この議題の資料">
        {documents.length === 0 ? (
          <p>この議題に紐づく資料はありません。</p>
        ) : (
          <ul class="list-plain">
            {documents.map((d) => (
              <li>
                {d.file_name}({formatBytes(d.file_size)})
              </li>
            ))}
          </ul>
        )}
        <form method="post" action="/api/admin/documents" enctype="multipart/form-data" class="admin-form">
          <input type="hidden" name="agenda_item_id" value={editingId} />
          <input type="hidden" name="return_to" value="agenda_item" />
          <div class="field">
            <label for="agenda_item_document_file">ファイル</label>
            <input type="file" id="agenda_item_document_file" name="file" required />
          </div>
          <button type="submit" class="button button--primary">
            この議題に資料をアップロード
          </button>
        </form>
      </AdminSection>
    )}
  </>
);
