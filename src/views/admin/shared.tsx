import type { FC } from "hono/jsx";
import { FLASH_LABELS, type FlashKind } from "../../lib/flash";

export const FlashBanner: FC<{ flash?: FlashKind }> = ({ flash }) => {
  if (!flash) return null;
  return (
    <div class="flash-banner" role="status" data-flash>
      {FLASH_LABELS[flash]}
    </div>
  );
};

export const ErrorList: FC<{ errors: string[] }> = ({ errors }) => {
  if (errors.length === 0) return null;
  return (
    <div class="error-banner" role="alert">
      <ul>
        {errors.map((e) => (
          <li>{e}</li>
        ))}
      </ul>
    </div>
  );
};

export const ReservedBadge: FC<{ publishedAt: string; now: string }> = ({ publishedAt, now }) =>
  publishedAt > now ? <span class="badge badge--reserved">予約中</span> : null;

export const DeleteForm: FC<{ action: string; label?: string }> = ({ action, label = "削除" }) => (
  <form method="post" action={action} class="inline-form" data-confirm="本当に削除しますか?">
    <button type="submit" class="button button--danger">
      {label}
    </button>
  </form>
);

/** 一覧共通のページ送り。前後リンク + 現在ページ周辺の番号(省略記号つき)。totalPages<=1 なら何も出さない。 */
export const Pagination: FC<{ page: number; totalPages: number; buildHref: (page: number) => string }> = ({
  page,
  totalPages,
  buildHref,
}) => {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);
  return (
    <nav class="pagination" aria-label="ページ送り">
      {page > 1 && (
        <a href={buildHref(page - 1)} class="pagination__link">
          前へ
        </a>
      )}
      {pages[0] > 1 && (
        <>
          <a href={buildHref(1)} class="pagination__link">
            1
          </a>
          {pages[0] > 2 && <span class="pagination__ellipsis">…</span>}
        </>
      )}
      {pages.map((p) =>
        p === page ? (
          <span class="pagination__current" aria-current="page">
            {p}
          </span>
        ) : (
          <a href={buildHref(p)} class="pagination__link">
            {p}
          </a>
        )
      )}
      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && <span class="pagination__ellipsis">…</span>}
          <a href={buildHref(totalPages)} class="pagination__link">
            {totalPages}
          </a>
        </>
      )}
      {page < totalPages && (
        <a href={buildHref(page + 1)} class="pagination__link">
          次へ
        </a>
      )}
    </nav>
  );
};

export const AdminSection: FC<{ title: string; description?: string; children: any }> = ({
  title,
  description,
  children,
}) => (
  <section>
    <h2>{title}</h2>
    {description && <p class="section-description">{description}</p>}
    {children}
  </section>
);
