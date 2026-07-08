import type { Context } from "hono";
import type { AppEnv } from "../env";

/**
 * P1-1: 保存/削除の成功表示。管理画面は private, no-store(design.md §9.1)なので
 * クエリ方式でもキャッシュ汚染の懸念はない。許可する値は固定の列挙のみ(§7 リスク対策)。
 */
export const FLASH_KINDS = ["created", "updated", "deleted"] as const;
export type FlashKind = (typeof FLASH_KINDS)[number];

export const FLASH_LABELS: Record<FlashKind, string> = {
  created: "保存しました",
  updated: "更新しました",
  deleted: "削除しました",
};

const isFlashKind = (v: string): v is FlashKind => (FLASH_KINDS as readonly string[]).includes(v);

export const getFlash = (c: Context<AppEnv>): FlashKind | undefined => {
  const v = c.req.query("flash");
  return v !== undefined && isFlashKind(v) ? v : undefined;
};

/** リダイレクト先 URL に `?flash=` と任意の引き継ぎクエリ(P1-2)を付与する。 */
export const withFlash = (path: string, kind: FlashKind, extraParams?: Record<string, string>): string => {
  const params = new URLSearchParams({ flash: kind, ...extraParams });
  return `${path}?${params.toString()}`;
};
