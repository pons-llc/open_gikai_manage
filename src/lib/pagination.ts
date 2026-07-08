/** 管理画面の一覧共通のページング。1ページあたりの件数は固定(将来的に画面ごとに変える必要が出たら引数化する)。 */
export const ADMIN_PAGE_SIZE = 20;

export const parsePage = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

export const paginationOffset = (page: number, pageSize: number = ADMIN_PAGE_SIZE): number => (page - 1) * pageSize;

export const totalPages = (totalCount: number, pageSize: number = ADMIN_PAGE_SIZE): number =>
  Math.max(1, Math.ceil(totalCount / pageSize));

/**
 * ページ送りリンクの href を組み立てる。既存の絞り込み・並べ替えクエリ(`page` 以外)は保持する。
 * `currentQuery` は `c.req.query()` の戻り値をそのまま渡せる。
 */
export const buildPageHref = (
  basePath: string,
  currentQuery: Record<string, string | undefined>,
  page: number
): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentQuery)) {
    if (key === "page" || value === undefined || value === "") continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
};
