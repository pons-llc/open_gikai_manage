import type { Bindings } from "../env";

/**
 * §3.4: announcements / agenda_items の予約公開は読み取り時フィルタで実現する。
 * cron は使わず、公開側クエリは常にこの条件を付けて未来日時の行を除外する。
 */
export const PUBLISHED_AT_CONDITION = "published_at <= datetime('now')";

export const withPublished = (whereClause?: string): string => {
  if (!whereClause || whereClause.trim() === "") return PUBLISHED_AT_CONDITION;
  return `(${whereClause}) AND ${PUBLISHED_AT_CONDITION}`;
};

/**
 * §10 セキュリティ監査(SQLインジェクション章): LIKE 検索(`?q=`)は `%` `_` をエスケープしないと
 * ユーザー入力がワイルドカードとして機能してしまい、意図しない全件一致(DoS 的な負荷)を招く。
 * `LIKE ? ESCAPE '\'` と組み合わせて使うこと。値そのものは通常どおり bind() で渡す(SQL 文には連結しない)。
 */
export const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export const containsPattern = (value: string): string => `%${escapeLikePattern(value)}%`;

export type { Bindings };
