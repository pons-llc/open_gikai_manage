/**
 * 管理者アカウント作成スクリプト(design.md §4)。
 * 公開登録エンドポイントは実装しないため、初期管理者はこのスクリプト経由で作成する。
 *
 * 使い方:
 *   npm run create-admin -- --email admin@example.jp --password 'xxxxxxxx' [--remote]
 *
 * パスワードのハッシュ化は src/lib/auth.ts の hashPassword と全く同じロジックを使う
 * (Node の Web Crypto は Workers ランタイムと同じ crypto.subtle を提供するため共有できる)。
 * D1 への書き込みは wrangler d1 execute 経由で行う(このスクリプト自体は Workers バインディングを持たない)。
 */
import { execFileSync } from "node:child_process";
import { hashPassword } from "../src/lib/auth";

const DB_NAME = "open-gikai";
const MIN_PASSWORD_LENGTH = 12;

function parseArgs(argv: string[]): { email?: string; password?: string; remote: boolean } {
  const result: { email?: string; password?: string; remote: boolean } = { remote: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") result.email = argv[++i];
    else if (arg === "--password") result.password = argv[++i];
    else if (arg === "--remote") result.remote = true;
  }
  return result;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

async function main() {
  const { email, password, remote } = parseArgs(process.argv.slice(2));

  if (!email || !password) {
    console.error("使い方: npm run create-admin -- --email <email> --password <password> [--remote]");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`不正なメールアドレスです: ${email}`);
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`パスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください。`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const sql = `INSERT INTO admin_users (email, password_hash) VALUES ('${escapeSqlString(
    email
  )}', '${escapeSqlString(passwordHash)}');`;

  const args = ["wrangler", "d1", "execute", DB_NAME, remote ? "--remote" : "--local", "--command", sql];
  console.log(`${remote ? "[remote]" : "[local]"} admin_users に ${email} を作成します...`);
  execFileSync("npx", args, { stdio: "inherit" });
  console.log("作成しました。/admin/login からログインできます。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
