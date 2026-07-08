import type { MiddlewareHandler } from "hono";

/**
 * §9.1: 実際の TTL 強制は Cloudflare ダッシュボードの Cache Rules（ゾーンレベル
 * Cache Everything）側が正。ここでは Cache-Control ヘッダーを付与するだけの
 * 薄い実装とし、キャッシュの読み書きは行わない（アプリ側バグをインフラ側で
 * 吸収する二重化のため、ヘッダーが欠けてもゾーン設定でカバーされる）。
 */
export const publicCache: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) {
    c.res.headers.set("Cache-Control", "public, max-age=1800");
  }
};

export const documentCache: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "public, max-age=86400, immutable");
};

/**
 * §9.1 / §10: /admin/* と /api/* は常にゾーンの Cache Rules で Bypass される想定だが、
 * ダッシュボード設定側の不備・未設定時にもエッジ/共有キャッシュ/ブラウザキャッシュに
 * 残らないよう、アプリ側でも明示的に private, no-store を付与する(二重化のバックストップ)。
 * ログイン/ログアウト等 Set-Cookie を含む応答が誤ってキャッシュされることを防ぐ。
 */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "private, no-store");
};
