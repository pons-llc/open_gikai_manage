import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../env";
import {
  DUMMY_PASSWORD_HASH,
  clearSessionCookie,
  createSession,
  deleteSession,
  readSessionCookie,
  setSessionCookie,
  verifyPassword,
} from "../../lib/auth";
import { str } from "../../lib/forms";
import { LoginPage } from "../../views/admin/login";
import { Layout } from "../../views/layout";

export const authRoute = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z.string().trim().min(1).email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

authRoute.get("/login", async (c) =>
  c.html(
    <Layout title="ログイン" variant="admin">
      <LoginPage errors={[]} email="" />
    </Layout>
  )
);

authRoute.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = str(form, "email");
  const password = str(form, "password");

  const renderError = (message: string, status: 400 | 401 = 401) =>
    c.html(
      <Layout title="ログイン" variant="admin">
        <LoginPage errors={[message]} email={email} />
      </Layout>,
      status
    );

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return renderError(parsed.error.issues[0]?.message ?? "入力内容を確認してください", 400);
  }

  const user = await c.env.DB.prepare(`SELECT id, password_hash FROM admin_users WHERE email = ?`)
    .bind(parsed.data.email)
    .first<{ id: number; password_hash: string }>();

  // ユーザーが存在しない場合もダミーハッシュで検証を走らせ、応答時間からアカウントの有無が漏れないようにする。
  const ok = await verifyPassword(parsed.data.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    return renderError("メールアドレスまたはパスワードが正しくありません");
  }

  const { token } = await createSession(c.env.DB, c.env.SESSION_SECRET, user.id);
  setSessionCookie(c, token);
  return c.redirect("/admin");
});

authRoute.post("/logout", async (c) => {
  const token = readSessionCookie(c);
  if (token) {
    await deleteSession(c.env.DB, c.env.SESSION_SECRET, token);
  }
  clearSessionCookie(c);
  return c.redirect("/admin/login");
});
