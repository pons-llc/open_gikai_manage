import type { FC } from "hono/jsx";
import { ALLOWED_EXTENSIONS } from "../../lib/storage";
import type { SelectOption } from "./committeeMemberships";
import { AdminSection, DeleteForm, ErrorList, Pagination } from "./shared";

export type DocumentRow = {
  id: number;
  file_name: string;
  file_size: number;
  extension: string;
  agenda_item_title: string | null;
  created_at: string;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentsPage: FC<{
  rows: DocumentRow[];
  agendaItems: SelectOption[];
  errors: string[];
  usedBytes: number;
  quotaBytes: number;
  filter: { q: string; unlinkedOnly: boolean };
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}> = ({ rows, agendaItems, errors, usedBytes, quotaBytes, filter, page, totalPages, buildHref }) => {
  const usedRatio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  return (
    <>
      <AdminSection title="資料一覧">
        <p class={usedRatio > 0.9 ? "hint storage-usage storage-usage--warning" : "hint storage-usage"}>
          使用量: {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}({(usedRatio * 100).toFixed(1)}%)
        </p>
        <form method="get" class="search-form">
          <label>
            ファイル名
            <input type="text" name="q" value={filter.q} placeholder="ファイル名で検索" />
          </label>
          <label class="checkbox-field">
            <input type="checkbox" name="unlinked" checked={filter.unlinkedOnly} />
            議題未紐付けのみ
          </label>
          <button type="submit" class="button button--primary">
            絞り込む
          </button>
        </form>
        {rows.length === 0 ? (
          <p>登録された資料はありません。</p>
        ) : (
          <table class="admin-table">
            <thead>
              <tr>
                <th>ファイル名</th>
                <th>サイズ</th>
                <th>拡張子</th>
                <th>紐づく議題</th>
                <th>登録日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td>{r.file_name}</td>
                  <td>{formatBytes(r.file_size)}</td>
                  <td>{r.extension}</td>
                  <td>{r.agenda_item_title ?? "-"}</td>
                  <td>{r.created_at}</td>
                  <td class="actions">
                    <DeleteForm action={`/admin/documents/${r.id}/delete`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
      </AdminSection>

      <AdminSection title="資料をアップロード">
        <ErrorList errors={errors} />
        <form method="post" action="/api/admin/documents" enctype="multipart/form-data" class="admin-form">
          <div class="field">
            <label for="file">ファイル</label>
            <input type="file" id="file" name="file" required />
            <p class="hint">許可拡張子: {ALLOWED_EXTENSIONS.join(", ")}(50MB まで)</p>
          </div>
          <div class="field">
            <label for="agenda_item_id">議題(任意)</label>
            <select id="agenda_item_id" name="agenda_item_id">
              <option value="">選択なし</option>
              {agendaItems.map((a) => (
                <option value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" class="button button--primary">
            アップロード
          </button>
        </form>
      </AdminSection>
    </>
  );
};
