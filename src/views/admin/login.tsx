import type { FC } from "hono/jsx";
import { ErrorList } from "./shared";

export const LoginPage: FC<{ errors: string[]; email: string }> = ({ errors, email }) => (
  <section>
    <h2>管理者ログイン</h2>
    <ErrorList errors={errors} />
    <form method="post" action="/admin/login" class="admin-form">
      <div class="field">
        <label for="email">メールアドレス</label>
        <input type="email" id="email" name="email" value={email} required />
      </div>
      <div class="field">
        <label for="password">パスワード</label>
        <input type="password" id="password" name="password" required />
      </div>
      <button type="submit" class="button button--primary">
        ログイン
      </button>
    </form>
  </section>
);
