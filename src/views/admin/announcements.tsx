import type { FC } from "hono/jsx";
import { AdminSection, DeleteForm, ErrorList, Pagination } from "./shared";

export type AnnouncementRow = {
  id: number;
  subject: string;
  published_at: string;
  is_reserved: number;
};

export type AnnouncementFormValues = {
  subject: string;
  body: string;
  related_url: string;
  published_at_local: string;
};

export const emptyAnnouncementForm: AnnouncementFormValues = {
  subject: "",
  body: "",
  related_url: "",
  published_at_local: "",
};

export const AnnouncementsPage: FC<{
  rows: AnnouncementRow[];
  form: AnnouncementFormValues;
  errors: string[];
  editingId: number | null;
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}> = ({ rows, form, errors, editingId, page, totalPages, buildHref }) => (
  <>
    <div class="admin-header-note">公開サイトへの反映には最大30分かかります(design.md §9.1)。</div>

    <AdminSection title="お知らせ一覧">
      {rows.length === 0 ? (
        <p>登録されたお知らせはありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>件名</th>
              <th>投稿日時</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.subject}</td>
                <td>{r.published_at}</td>
                <td>{r.is_reserved ? <span class="badge badge--reserved">予約中</span> : "公開済み"}</td>
                <td class="actions">
                  <a href={`/admin/announcements/${r.id}/edit`}>編集</a>{" "}
                  <DeleteForm action={`/admin/announcements/${r.id}/delete`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </AdminSection>

    <AdminSection title={editingId ? "お知らせを編集" : "お知らせを登録"}>
      <ErrorList errors={errors} />
      <form
        method="post"
        action={editingId ? `/admin/announcements/${editingId}` : "/admin/announcements"}
        class="admin-form"
      >
        <div class="field">
          <label for="subject">件名</label>
          <input type="text" id="subject" name="subject" value={form.subject} required />
        </div>
        <div class="field">
          <label for="body">詳細</label>
          <textarea id="body" name="body" required>
            {form.body}
          </textarea>
        </div>
        <div class="field">
          <label for="related_url">関連URL(任意)</label>
          <input type="url" id="related_url" name="related_url" value={form.related_url} placeholder="https://" />
        </div>
        <div class="field">
          <label for="published_at_local">予定公開日時(空欄 = 即時公開)</label>
          <input type="datetime-local" id="published_at_local" name="published_at_local" value={form.published_at_local} />
          <p class="hint">30分キャッシュのため、実際の公開はこの時刻から最大30分遅れます(§3.4)。</p>
        </div>
        <button type="submit" class="button button--primary">
          {editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <a href="/admin/announcements" style="margin-left: 1rem;">
            キャンセル
          </a>
        )}
      </form>
    </AdminSection>
  </>
);
