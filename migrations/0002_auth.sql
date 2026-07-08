PRAGMA foreign_keys = ON;

-- 管理者アカウント(自前 ID/PASS 認証、design.md §3.2.1 / §4)
CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,               -- 形式: pbkdf2$<反復回数>$<salt(base64)>$<hash(base64)>
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- セッション(Cookie には平文トークンのみ。DB にはハッシュ済みトークンのみ保存し、
-- DB 漏洩時にセッション Cookie を再利用不能にする)
CREATE TABLE admin_sessions (
  token_hash    TEXT    PRIMARY KEY,             -- HMAC-SHA256(token, SESSION_SECRET) の hex
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at    TEXT    NOT NULL,                -- 発行から 7 日固定
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
