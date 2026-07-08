import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // §4: 7日固定、スライディング更新はしない

export const SESSION_COOKIE_NAME = "gikai_session";

const textEncoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const toBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const toSqliteDatetime = (date: Date): string => date.toISOString().slice(0, 19).replace("T", " ");

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

/** §4: PBKDF2-SHA256、ユーザーごとのランダム salt。pbkdf2$<反復回数>$<salt(base64)>$<hash(base64)> 形式で保存する。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

// user-enumeration 対策(ログイン失敗の応答時間を揃える)用のダミーハッシュ。実際のログインには使われない。
export const DUMMY_PASSWORD_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(new Uint8Array(SALT_BYTES))}$${toBase64(
  new Uint8Array(KEY_LENGTH_BITS / 8)
)}`;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const keyMaterial = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    expected.length * 8
  );
  return constantTimeEqual(new Uint8Array(bits), expected);
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return toHex(new Uint8Array(sig));
}

/** §4: 平文トークンは Cookie のみ。DB には HMAC-SHA256 ハッシュだけを保存する(DB 漏洩時にセッション再利用不能にするため)。 */
export async function createSession(
  db: D1Database,
  secret: string,
  adminUserId: number
): Promise<{ token: string; expiresAt: string }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)));
  const tokenHash = await hmacHex(secret, token);
  const expiresAt = toSqliteDatetime(new Date(Date.now() + SESSION_TTL_MS));
  await db
    .prepare(`INSERT INTO admin_sessions (token_hash, admin_user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(tokenHash, adminUserId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function verifySession(
  db: D1Database,
  secret: string,
  token: string
): Promise<{ id: number; email: string } | null> {
  const tokenHash = await hmacHex(secret, token);
  const row = await db
    .prepare(
      `SELECT u.id, u.email FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    )
    .bind(tokenHash)
    .first<{ id: number; email: string }>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, secret: string, token: string): Promise<void> {
  const tokenHash = await hmacHex(secret, token);
  await db.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).bind(tokenHash).run();
}

export const setSessionCookie = (c: Context<AppEnv>, token: string): void => {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
};

export const clearSessionCookie = (c: Context<AppEnv>): void => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
};

export const readSessionCookie = (c: Context<AppEnv>): string | undefined => getCookie(c, SESSION_COOKIE_NAME);

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/logout"]);

/** §4: /admin/*(/admin/login 除く)と /api/admin/* にセッション検証を適用。未認証は /admin/login へリダイレクト(API は 401 JSON)。 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (PUBLIC_ADMIN_PATHS.has(c.req.path)) {
    return next();
  }
  const token = readSessionCookie(c);
  const session = token ? await verifySession(c.env.DB, c.env.SESSION_SECRET, token) : null;
  if (!session) {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: { code: "unauthorized", message: "認証が必要です" } }, 401);
    }
    return c.redirect("/admin/login");
  }
  c.set("adminUserId", session.id);
  c.set("adminEmail", session.email);
  await next();
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** §4: better-auth が自動で行っていた origin チェックの代替。状態変更リクエストの Origin ヘッダーを APP_URL と照合する。 */
export const requireSameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method)) {
    const origin = c.req.header("Origin");
    let expected: string;
    try {
      expected = new URL(c.env.APP_URL).origin;
    } catch {
      expected = c.env.APP_URL;
    }
    if (!origin || origin !== expected) {
      return c.text("Forbidden: origin mismatch", 403);
    }
  }
  await next();
};
