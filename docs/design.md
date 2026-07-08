# 議会文書管理システム 設計書

- 版: 1.11
- 作成日: 2026-07-07（1.1: 同日 — コスト管理・会派所属・セキュリティ監査・お知らせテーブルを追加 / 1.2: 同日 — キャッシュ方式をゾーンレベル Cache Everything に変更、Bot Fight Mode を追加、R2 配信方式の判断を明記 / 1.3: 同日 — 議題に予約公開機能を追加 / 1.4: 同日 — 日程と議題を直接紐づける `meeting_agenda_items` を追加 / 1.5: 同日 — 認証を better-auth から D1 + Web Crypto の自前実装に変更 / 1.6: 同日 — 議員ごとの賛否記録 `agenda_item_votes` を追加 / 1.7: 同日 — フェーズ6のセキュリティ監査で発覚した資料ダウンロードの公開状態バイパスを修正、§12未決事項3を解決 / 1.8: 同日 — 管理操作ログ(console.log構造化JSON)を全管理ルートに実装、公開議員一覧に「期」絞り込みを追加、デモデータ投入スクリプトを追加 / 1.9: 同日 — 議題詳細の賛否結果は賛否が記録された会議のみ表示するよう変更、日程一覧の定例会絞り込みを削除（月別カレンダーのみ） / 1.10: 同日 — 公開議題一覧にキーワード検索（`?q=`）を追加、LIKE パターンのエスケープ方針を明記 / 1.11: 2026-07-08 — `docs/admin-ux-improvement-plan.md` を実装。管理画面にフラッシュメッセージ・「登録して続けて入力」・グループ化ナビを追加(P1)、議題/日程/資料一覧に絞り込みを追加(P1-4)、議員・委員会・定例会の詳細ハブページを追加し所属画面をハブに吸収(P2)、日程フォームの議題・資料チェックリストに絞り込み・表示順自動採番・その場アップロードを追加(P3)、議題クイック作成 API `POST /api/admin/agenda-items` を追加(P3-4)、ダッシュボードを「今日やること」型に刷新(P4)。データテーブルの変更なし）
- 元資料: [idea.md](../idea.md)

---

## 1. システム概要

### 1.1 目的

市民が地方議会の文書（会議資料）や議会日程を簡単に閲覧できるようにするための、地方自治体向けシステム。

### 1.2 利用者と権限

| ロール | 説明 | 認証 |
|--------|------|------|
| 市民（閲覧者） | 日程・議題・資料を閲覧、資料をダウンロード | 不要（匿名） |
| 事務局職員（管理者） | 各マスタの登録・編集、日程管理、資料アップロード | 必要（自前 ID/PASS 認証） |

閲覧系はすべて公開、更新系はすべて認証必須という単純な 2 層モデルとする。ロール細分化（承認フロー等）は将来拡張とし、本設計のスコープ外。

### 1.3 技術スタック

| レイヤ | 技術 | 用途 |
|--------|------|------|
| 実行基盤 | Cloudflare Workers | SSR（HTML レンダリング）+ API |
| ルーティング/SSR | Hono + hono/jsx | Workers 上の事実上の標準。JSX で HTML を組み立てる |
| データベース | Cloudflare D1 (SQLite) | 全業務データ + 認証データ |
| オブジェクトストレージ | Cloudflare R2 | アップロードされた会議資料（PDF 等）の実体 |
| 静的アセット | Workers Static Assets | CSS / クライアント JS（R2 は資料専用とし、アセットは Assets 機能で配信） |
| 認証 | 自前実装（D1 + Web Crypto、better-auth 不使用） | 管理者のメール+パスワード認証 |
| フロントエンド | vanilla JS（プログレッシブエンハンスメント） | SSR した HTML に最小限の JS を付加。ビルド不要を基本とする |
| デザイン | デジタル庁デザインシステム (DADS) v2.12.0 | 同梱の [design-system-mcp](../design-system-mcp/) をエディタに登録し、トークン・コンポーネント仕様を参照して実装 |

方針: **JS が無効でも閲覧系はすべて動作する**こと。フォームは通常の `<form>` POST を基本とし、JS は UX 向上（動的セレクト、確認ダイアログ等）にのみ使う。

---

## 2. アーキテクチャ

```
[市民ブラウザ]──GET──▶┌───────────────────────────┐
                      │ Cloudflare Edge（ゾーン） │
                      │ ├ Bot Fight Mode          │
                      │ ├ WAF レートリミット      │
[職員ブラウザ]──────▶ │ └ Cache Rules(Cache      │
        │             │    Everything, §9.1)     │
        └─Cookie認証──▶│    ヒット時は下流に到達  │
                      │    せず即応答            │
                      └──────────┬────────────────┘
                                 │ キャッシュミス or 除外パス
                                 ▼
                      ┌─────────────────────────────┐
                      │  Cloudflare Worker (Hono)   │
                      │  ├ 公開ルート  /            │──▶ D1 (業務データ+認証)
                      │  ├ 管理ルート  /admin/*     │──▶ R2 (資料ファイル)
                      │  └ 認証ルート  /api/auth/*  │
                      └─────────────────────────────┘
                         Static Assets: /assets/*  (CSS, JS)
```

- 単一 Worker で公開画面・管理画面・API をすべて提供する（モノリス）。
- ページは Worker 側で SSR。管理画面の一部操作のみ `fetch` API を併用。
- **キャッシュとボット対策は Worker より手前のゾーン(Cloudflare Edge)で処理する。** ヒット時は Worker が一切起動しないため、アクセス急増・ボット巡回によるコストスパイクを Worker/D1 に到達させない（詳細は §9）。
- 資料ダウンロードは Worker 経由で R2 からストリーミング配信（`GET /documents/:id/file`）。R2 バケットは非公開のままとし、公開判定ロジックを Worker に集約する。R2 バケットへの直接公開 URL（R2.dev / R2 カスタムドメイン）は使わない — 判断理由は §5.3 のコラムを参照。

### 2.1 Cloudflare リソース構成（wrangler.jsonc）

```jsonc
{
  "name": "open-gikai",
  "main": "src/index.tsx",
  "compatibility_date": "2026-07-01",
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "open-gikai", "database_id": "<作成後に設定>" }
  ],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "open-gikai-documents" }
  ],
  "vars": {
    "APP_URL": "https://gikai.example.jp",
    "STORAGE_QUOTA_BYTES": "1099511627776"  // 総容量クォータ 1TB（§9.2）
  }
  // SESSION_SECRET は `wrangler secret put` で登録（セッショントークンの HMAC 化に使う）
}
```

---

## 3. データベース設計（D1 / SQLite）

### 3.1 ER 概要

```
factions(会派)◀──── faction_memberships(会派所属) ────▶ members(議員)
                                                          │1
                                                          │*
committees(委員会)◀──────────────────────── committee_memberships(委員会所属)
   │1
   │*
meetings(日程) ────*──▶ regular_sessions(定例会) [任意]
   │ │ │
   │ │ └─ previous_meeting_id で自己参照（「前の会議終了後」）
   │ │*
   │ meeting_agenda_items(会議-議題) ────*──▶ agenda_items(議題)
   │*                                          │        │*        │*
meeting_documents ──*──▶ documents(資料) ──*──▶┘        ▼          ▼
                              (任意で議題に紐付け)  agenda_types(議案種別)  committees

announcements(お知らせ)  ※独立テーブル

meeting_agenda_items(会議-議題) ────*──▶ agenda_item_votes(賛否記録) ◀──*──── members(議員)
```

- `meeting_documents`: 会議全体に関わる資料（次第・会議録など、特定の議題に紐づかないもの）を会議に紐付ける。
- `meeting_agenda_items`: その会議で扱う議題を紐付ける（1つの議題が複数回の会議— 委員会付託→委員会審査→本会議採決 — にまたがることがあるため多対多）。会議詳細画面では、この関連経由で議題ごとに `documents.agenda_item_id` の資料を表示する。
- `agenda_item_votes`（1.6 追加）: `meeting_agenda_items` の各組（＝「どの会議でその議題を採決したか」）ごとに、議員一人ひとりの賛否（賛成/反対/棄権/欠席）を記録する。同じ議題でも委員会採決と本会議採決で結果が異なりうるため `meeting_id` を含めて記録する（`meeting_agenda_items(meeting_id, agenda_item_id)` への複合外部キー）。

### 3.2 DDL（`migrations/0001_init.sql`）

D1 のマイグレーション機能（`wrangler d1 migrations`)で管理する。

```sql
PRAGMA foreign_keys = ON;

-- 委員会（常任・特別・議会運営・その他任意設置会議）
CREATE TABLE committees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,                -- 例: 総務常任委員会
  category      TEXT    NOT NULL                 -- standing:常任 / special:特別
                CHECK (category IN ('standing','special','steering','other')),
                                                 -- steering:議会運営 / other:その他
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,      -- 廃止済み委員会は 0
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 定例会マスタ
CREATE TABLE regular_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,                      -- 例: 令和8年第1回定例会
  start_date TEXT NOT NULL,                      -- 会期開始 YYYY-MM-DD
  end_date   TEXT NOT NULL,                      -- 会期終了 YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_date <= end_date)
);

-- 議案種別（初期レコード: 議案・報告・認定）
CREATE TABLE agenda_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO agenda_types (name, display_order) VALUES ('議案',1),('報告',2),('認定',3);

-- 議題
CREATE TABLE agenda_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,               -- 議題名
  fiscal_year    INTEGER NOT NULL,               -- 年度（西暦）
  number         INTEGER NOT NULL,               -- 番号
  category       TEXT    NOT NULL
                 CHECK (category IN ('bill','petition','appeal','committee','other')),
                 -- bill:議案 / petition:請願 / appeal:陳情 / committee:委員会 / other:その他
  agenda_type_id INTEGER REFERENCES agenda_types(id),   -- category='bill' のときのみ必須
  committee_id   INTEGER REFERENCES committees(id),     -- category='committee' のときのみ必須
  published_at   TEXT    NOT NULL DEFAULT (datetime('now')), -- 予定公開日時。未来日時 = 予約公開（未指定なら即時公開）
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  -- 種類と参照の整合性を DB レベルでも担保する
  CHECK ((category = 'bill')      = (agenda_type_id IS NOT NULL)),
  CHECK ((category = 'committee') = (committee_id  IS NOT NULL)),
  UNIQUE (fiscal_year, category, number)         -- 年度×種類内で番号一意
);
CREATE INDEX idx_agenda_items_published ON agenda_items(published_at);

-- 資料（R2 オブジェクトのメタデータ）
CREATE TABLE documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key         TEXT    NOT NULL UNIQUE,        -- 例: documents/2026/01HXXX....pdf
  file_name      TEXT    NOT NULL,               -- 元ファイル名（表示・DL 時に使用）
  file_size      INTEGER NOT NULL,               -- バイト数
  extension      TEXT    NOT NULL,               -- 例: pdf
  content_type   TEXT    NOT NULL,               -- 例: application/pdf
  agenda_item_id INTEGER REFERENCES agenda_items(id) ON DELETE SET NULL, -- 議題選択（任意）
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_agenda ON documents(agenda_item_id);

-- 日程（本会議・委員会の開催予定）
CREATE TABLE meetings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_type        TEXT    NOT NULL CHECK (meeting_type IN ('plenary','committee')),
                                                  -- plenary:本会議 / committee:委員会
  committee_id        INTEGER REFERENCES committees(id),
  regular_session_id  INTEGER REFERENCES regular_sessions(id) ON DELETE SET NULL, -- 任意紐付け
  date                TEXT    NOT NULL,           -- 開催日 YYYY-MM-DD
  start_type          TEXT    NOT NULL DEFAULT 'fixed'
                      CHECK (start_type IN ('fixed','after_previous')),
  start_time          TEXT,                       -- HH:MM。start_type='fixed' のとき必須
  previous_meeting_id INTEGER REFERENCES meetings(id),
                                                  -- start_type='after_previous' のとき必須。
                                                  -- 「前の会議終了後」に開始する会議を指す
  schedule_text       TEXT    NOT NULL DEFAULT '',-- 日程本文（自由テキスト）
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK ((meeting_type = 'committee') = (committee_id IS NOT NULL)),
  CHECK ((start_type = 'fixed')          = (start_time IS NOT NULL)),
  CHECK ((start_type = 'after_previous') = (previous_meeting_id IS NOT NULL))
);
CREATE INDEX idx_meetings_date    ON meetings(date);
CREATE INDEX idx_meetings_session ON meetings(regular_session_id);

-- 日程⇔資料の関連（会議資料の選択。次第・会議録など議題に紐づかない全体資料）
CREATE TABLE meeting_documents (
  meeting_id    INTEGER NOT NULL REFERENCES meetings(id)  ON DELETE CASCADE,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, document_id)
);

-- 日程⇔議題の関連（この会議で扱う議題。1議題が複数会議にまたがる場合があるため多対多）
CREATE TABLE meeting_agenda_items (
  meeting_id     INTEGER NOT NULL REFERENCES meetings(id)     ON DELETE CASCADE,
  agenda_item_id INTEGER NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  display_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, agenda_item_id)
);
CREATE INDEX idx_mai_agenda ON meeting_agenda_items(agenda_item_id);

-- 議員
CREATE TABLE members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,               -- 氏名
  election_count INTEGER NOT NULL,               -- 当選期（例: 3 = 3期目）
  elected_on     TEXT    NOT NULL,               -- 当選年月日 YYYY-MM-DD
  seat_number    INTEGER NOT NULL,               -- 議席番号
  is_active      INTEGER NOT NULL DEFAULT 1,     -- 任期満了・辞職は 0
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 委員会所属（任期付き）
CREATE TABLE committee_memberships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  member_id    INTEGER NOT NULL REFERENCES members(id),
  role         TEXT    NOT NULL DEFAULT 'member'
               CHECK (role IN ('chair','vice_chair','member')), -- 委員長/副委員長/委員
  term_start   TEXT    NOT NULL,                 -- 任期開始 YYYY-MM-DD
  term_end     TEXT,                             -- 任期終了（NULL = 現任）
  CHECK (term_end IS NULL OR term_start <= term_end)
);
CREATE INDEX idx_cm_committee ON committee_memberships(committee_id);
CREATE INDEX idx_cm_member    ON committee_memberships(member_id);

-- 会派
CREATE TABLE factions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,                  -- 会派名
  established_on TEXT NOT NULL,                  -- 設置年月日 YYYY-MM-DD
  is_active      INTEGER NOT NULL DEFAULT 1
);

-- 会派所属（任期付き）
CREATE TABLE faction_memberships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id INTEGER NOT NULL REFERENCES factions(id),
  member_id  INTEGER NOT NULL REFERENCES members(id),
  term_start TEXT    NOT NULL,                   -- 所属開始 YYYY-MM-DD
  term_end   TEXT,                               -- 所属終了（NULL = 現所属）
  CHECK (term_end IS NULL OR term_start <= term_end)
);
CREATE INDEX idx_fm_faction ON faction_memberships(faction_id);
CREATE INDEX idx_fm_member  ON faction_memberships(member_id);

-- お知らせ（予約投稿対応）
CREATE TABLE announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject      TEXT NOT NULL,                    -- 件名
  body         TEXT NOT NULL,                    -- 詳細（プレーンテキスト、改行保持で表示）
  related_url  TEXT,                             -- 関連URL（任意。http/https のみ許可）
  published_at TEXT NOT NULL,                    -- 投稿日時 ISO 8601。未来日時 = 予約投稿
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_announcements_published ON announcements(published_at);
```

### 3.2.1 認証テーブル（`migrations/0002_auth.sql`）

better-auth は使わず、自前実装用の 2 テーブルを手書きする（§4）。

```sql
-- 管理者アカウント
CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,               -- 形式: pbkdf2$<反復回数>$<salt(base64)>$<hash(base64)>
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- セッション（Cookie には平文トークンのみ。DB にはハッシュ済みトークンのみ保存し、
-- DB 漏洩時にセッション Cookie を再利用不能にする）
CREATE TABLE admin_sessions (
  token_hash    TEXT    PRIMARY KEY,             -- HMAC-SHA256(token, SESSION_SECRET) の hex
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at    TEXT    NOT NULL,                -- 発行から 7 日固定
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
```

> 補足
> - idea.md の「議題の時のみ議案種別テーブルから選択」は文脈上「**議案**の時のみ」と解釈した（種類=議案 → 議案種別を選択）。相違があれば `CHECK` を修正する。
> - 会派所属は委員会所属と同じく任期期間の重複禁止をアプリ層で判定する。ある議員が同時に所属できる会派は 1 つ（`term_end IS NULL` の行は議員ごとに最大 1 件）。
> - 認証テーブルも業務テーブルと同じ素の `env.DB.prepare()` で扱う（better-auth のアダプタ縛りがないため統一できる）。

### 3.2.2 議員ごとの賛否記録（`migrations/0003_votes.sql`、1.6 追加）

```sql
-- 議員ごとの賛否記録。meeting_agenda_items の各組(会議×議題)ごとに記録する
-- (同じ議題でも委員会採決と本会議採決で結果が異なりうるため meeting_id を含める)。
CREATE TABLE agenda_item_votes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id     INTEGER NOT NULL,
  agenda_item_id INTEGER NOT NULL,
  member_id      INTEGER NOT NULL REFERENCES members(id),
  vote_result    TEXT    NOT NULL CHECK (vote_result IN ('for','against','abstain','absent')),
                                                 -- for:賛成 / against:反対 / abstain:棄権 / absent:欠席
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (meeting_id, agenda_item_id, member_id),
  FOREIGN KEY (meeting_id, agenda_item_id)
    REFERENCES meeting_agenda_items(meeting_id, agenda_item_id) ON DELETE CASCADE
);
CREATE INDEX idx_agenda_item_votes_agenda_item ON agenda_item_votes(agenda_item_id);
CREATE INDEX idx_agenda_item_votes_member ON agenda_item_votes(member_id);
```

> 補足
> - `(meeting_id, agenda_item_id)` への複合外部キーにより、`meeting_agenda_items` に存在しない(＝その会議でその議題を扱っていない)組み合わせへの投票記録を DB レベルで防ぐ。管理画面の日程編集画面でその会議から議題の紐付けを外すと、`ON DELETE CASCADE` により当該組の賛否記録も連動して削除される。
> - 賛否の公開可否は `agenda_items.published_at` にそのまま従う（賛否記録専用の予約公開機構は持たない）。未公開の議題の賛否を公開側で表示してはならない（§3.4 と同じ原則）。

### 3.3 「前の会議終了後」の表示ロジック

- `start_type='after_previous'` の会議は、開始時刻の代わりに「（`previous_meeting_id` の会議名）終了後」と表示する。
- 同一日の並び順は次のキーで決める:
  1. `start_type='fixed'` は `start_time` 順
  2. `after_previous` は参照先会議の直後に挿入（チェーンをたどって展開）
- 管理画面のバリデーション: `previous_meeting_id` は**同一 `date` の会議のみ**選択可・自己参照禁止・循環参照禁止（保存時にチェーンをたどって検出し 422 を返す）。

### 3.4 予約公開（お知らせ・議題）

`announcements` と `agenda_items` は同じ「予定公開日時」パターンを共有する。共通ルール:

- 予約公開は**読み取り時フィルタ**で実現する。公開側のクエリは常に `WHERE published_at <= datetime('now')` を付け、未来日時の行は表示しない。cron やバックグラウンドジョブは使わない（コスト方針 §9 と整合）。DB クエリヘルパ（`src/lib/db.ts`）に `withPublished(query)` のような共通ヘルパを用意し、両テーブルで同じ条件式を使い回す（書き漏れ防止）。
- 管理画面の一覧は全件表示し、`published_at` が未来の行に「予約中」バッジを付ける。
- 30 分キャッシュ（§9.1）により、実際の公開は `published_at` から**最大 30 分遅れる**。分単位の正確な公開時刻が必要な運用は想定しない旨を管理画面に明記する。
- `announcements.related_url` は `http:` / `https:` スキームのみ許可（`javascript:` 等を拒否 — XSS 対策。§8 のバリデーションに含める）。

**議題の予約公開に固有の注意点（会議画面への露出経路が 2 つある）**

議題（`agenda_items`）は `/agenda-items`（議案検索）に加え、`meetings` から**2 つの経路**で公開画面に露出しうる。どちらも予約公開前の議題情報を漏らしてはならない。

1. **直接経路**: `meeting_agenda_items` 経由 — 会議詳細 `/meetings/:id` は「この会議で扱う議題」一覧を直接表示する（§5.1 で新設）。
2. **間接経路**: `documents.agenda_item_id` 経由 — 会議資料一覧で「この資料はどの議題のものか」を表示する場合。

ルール:

- 未公開（`published_at > now`）の議題は、上記どちらの経路でも一覧に出さない（タイトル・リンク・議案種別・委員会名を含め一切言及しない）。資料そのものの表示可否は別軸（§12 未決事項「資料の公開タイミング」）であり、本ルールは議題情報の露出だけを止める。
- `meeting_agenda_items` を JOIN するクエリ、`documents.agenda_item_id` を JOIN するクエリの**両方**に `agenda_items.published_at <= datetime('now')` 条件を付ける。前者は `INNER JOIN`（未公開議題は行ごと除外）、後者は `LEFT JOIN` で未公開時は議題情報を NULL 扱いにする。
- 会議詳細ページの構成: ①会議情報 ②議題一覧（`meeting_agenda_items` 経由、公開済みのみ）— 各議題ごとにその資料（`documents.agenda_item_id` 経由、同じく公開済みの議題のもののみ）③会議全体の資料（`meeting_documents` 経由、議題非依存）。
- 実装時は `/security-audit` の IDOR チェック項目（§4 認証・認可）で、この 2 経路が両方フィルタされているか確認する。

---

## 4. 認証設計（自前実装・ID/PASS）

**方針転換（1.4→1.5）**: 当初案の better-auth 採用をやめ、D1 + Web Crypto（`SubtleCrypto`）のみで完結する自前実装に変更した。依存ライブラリを増やさず、管理者ログインという単機能に対して better-auth のアダプタ/CLI 生成物を持ち込むのは過剰と判断（YAGNI）。

- 方式: メールアドレス + パスワード。セッションは Cookie（`HttpOnly` / `Secure` / `SameSite=Lax`）。
- パスワードハッシュ: PBKDF2-SHA256（反復回数 210,000 目安、ユーザーごとにランダム 16 バイト salt）。`admin_users.password_hash` に `pbkdf2$<反復回数>$<salt(base64)>$<hash(base64)>` 形式で格納する。Workers ランタイム標準の `crypto.subtle.deriveBits` を使用し、追加パッケージは不要。
- セッション: 発行時にランダム 32 バイトトークンを生成し、**平文トークンのみ** Cookie に設定する。DB（`admin_sessions.token_hash`）には `HMAC-SHA256(token, SESSION_SECRET)` の hex を保存し、平文トークンは保存しない（DB 漏洩時にセッションを再利用不能にするため）。有効期限は発行から **7 日固定**（スライディング更新はしない — シンプルさ優先。§3.2.1）。
- 公開登録エンドポイントは**実装しない**。管理者アカウントは CLI スクリプト（`scripts/create-admin.ts` → `wrangler d1 execute`）で作成する。
- ミドルウェア: `/admin/*`（`/admin/login` を除く）と `/api/admin/*` に `requireAuth` を適用。未認証は `/admin/login` へリダイレクト（API は 401 JSON）。
- CSRF: better-auth が自動で行っていた origin チェックを自前ミドルウェア `requireSameOrigin` として実装し、状態変更リクエスト（POST/PUT/DELETE）で `Origin` ヘッダーが `APP_URL` と一致することを検証する。`SameSite=Lax` Cookie と合わせた二重防御とする。

```ts
// src/lib/auth.ts の骨子（すべて Web Crypto 標準 API のみで実装、追加パッケージ不要）

// パスワード: PBKDF2-SHA256、ユーザーごとの salt
export async function hashPassword(password: string): Promise<string> { /* crypto.subtle.deriveBits */ }
export async function verifyPassword(password: string, stored: string): Promise<boolean> { /* 定数時間比較 */ }

// セッション: 平文トークンは Cookie のみ、DB には HMAC-SHA256 ハッシュを保存
export async function createSession(db: D1Database, secret: string, adminUserId: number):
  Promise<{ token: string; expiresAt: string }> { /* crypto.getRandomValues + HMAC */ }
export async function verifySession(db: D1Database, secret: string, token: string):
  Promise<{ id: number; email: string } | null> { /* HMAC 再計算して admin_sessions を照合、期限切れなら null */ }

// ミドルウェア
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => { /* Cookie検証、失敗時リダイレクト/401 */ };
export const requireSameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => { /* POST/PUT/DELETE の Origin 検証 */ };

// ルーティング（Hono 側）: POST /admin/login でログイン処理、POST /admin/logout でセッション破棄（§5.2）
```

（D1 接続は業務テーブルと同じ素の `env.DB.prepare()` を使う。better-auth 撤去によりアダプタ縛りがなくなったため統一できる。）

---

## 5. ルーティング / API 設計

### 5.1 公開ページ（SSR・認証不要）

| パス | 内容 |
|------|------|
| `GET /` | トップ。直近の会議日程（本日以降 10 件）+ 開会中の定例会 + 最新お知らせ 5 件 |
| `GET /news` | お知らせ一覧（公開済みのみ、`published_at` 降順） |
| `GET /news/:id` | お知らせ詳細（件名・詳細・関連URL・投稿日時。未公開は 404） |
| `GET /meetings` | 日程一覧（月別カレンダー表示、日曜始まり、前月/次月ナビゲーション）。クエリ: `?year=&month=`（表示する年月。未指定時は当月。実装時に `?from=&to=` から変更 — 月単位のグリッド描画と噛み合わせやすいため）。定例会での絞り込みは不要と判断し実装していない（1.9で削除） |
| `GET /meetings/:id` | 会議詳細。日程テキスト・開始時刻（または「〇〇終了後」）・議題一覧（`meeting_agenda_items` 経由、議題ごとに紐づく資料も表示）・会議全体の資料一覧（`meeting_documents` 経由）。未公開議題（`published_at > now`）は一覧にもその資料にも出さない（§3.4） |
| `GET /sessions` | 定例会一覧（会期と紐づく日程） |
| `GET /agenda-items` | 議題一覧（議案検索）。クエリ: `?year=` `?category=` `?q=`（議題名の部分一致キーワード検索、1.10追加。`%` `_` はエスケープしリテラル文字として扱う — §10）。`published_at <= now` の議題のみ（§3.4）。ゾーンの Cache Rules はフル URL(クエリ文字列込み)単位でキャッシュするため、`?q=` を含むあらゆる組み合わせがそれぞれ独立にキャッシュされる（§9.1、追加のコード対応は不要） |
| `GET /agenda-items/:id` | 議題詳細。紐づく資料一覧。この議題を扱った会議のうち、賛否が記録された会議のみ議員別賛否結果を表示する（`agenda_item_votes`、1.6追加。未記録の会議は表示しない、1.9で変更）。未公開は 404（§3.4） |
| `GET /committees` | 委員会一覧 + 現任の所属議員 |
| `GET /members` | 議員一覧（議席番号順）・会派。`?term=<当選年月日>` で「期」を絞り込める（1.7追加。`members` に期を表す専用カラムは無いため、同一 `elected_on` の議員をまとめて1期として扱う）。未指定時は最新の `elected_on` をデフォルト表示。`is_active` を問わず表示するため、過去（退任済み）の議員も閲覧できる |
| `GET /documents/:id/file` | 資料ダウンロード。R2 からストリーミング。`Content-Disposition: inline`（PDF はブラウザ内表示）、`file_name` を filename に設定 |

### 5.2 管理ページ（SSR・要認証）

| パス | 内容 |
|------|------|
| `GET /admin/login` | ログイン画面（唯一の未認証管理ページ） |
| `POST /admin/login` | ログイン処理（email + password を検証、セッション Cookie を発行して `/admin` へリダイレクト。失敗時はログイン画面を 401 で再表示） |
| `POST /admin/logout` | ログアウト（`admin_sessions` の行を削除し Cookie を失効、`/admin/login` へリダイレクト） |
| `GET /admin` | ダッシュボード。「今日やること」型(1.11変更): 直近の日程 / 賛否が未記録の終了済み会議 / 予約中の議題・お知らせ / ストレージ使用量バー。マスタ件数の一覧表はナビと重複するため廃止した |
| `GET /admin/{committees,sessions,agenda-types,members,factions}` | 各マスタの一覧 + 登録/編集フォーム。うち議員・委員会・定例会は一覧の「詳細」リンクから §5.2 のハブページに遷移する(1.11、下記参照) |
| `GET /admin/{memberships,faction-memberships}` | 委員会所属・会派所属の横断一覧(閲覧+編集)。1.11 でナビからは外したが URL は維持し、ハブページから「横断一覧を見る」リンクで到達できる |
| `GET /admin/members/:id` | 議員詳細ハブ(1.11追加)。基本情報フォーム + 会派所属・委員会所属の履歴 + その場追加フォーム + 「終了する」1クリック操作を1画面に同居させる(admin-ux-improvement-plan.md P2-1)。旧 `GET /admin/members/:id/edit` は残存するが、一覧の「詳細」リンク先はここに変更した |
| `POST /admin/members/:id/faction-memberships` `POST /admin/members/:id/faction-memberships/:mid/end` `POST /admin/members/:id/committee-memberships` `POST /admin/members/:id/committee-memberships/:mid/end` | 議員ハブ内の所属追加・終了。検証・INSERT ロジックは `src/lib/memberships.ts` に抽出し、`/admin/memberships` `/admin/faction-memberships` の既存ハンドラと共用する |
| `GET /admin/committees/:id` | 委員会詳細ハブ(1.11追加)。基本情報フォーム + 現在の委員構成(役職順)+ 過去の委員(折りたたみ)+ その場追加フォーム(P2-2) |
| `POST /admin/committees/:id/committee-memberships` `POST /admin/committees/:id/committee-memberships/:mid/end` | 委員会ハブ内の委員追加・任期終了(議員ハブと同じ lib 関数を共用) |
| `GET /admin/sessions/:id` | 定例会詳細ハブ(1.11追加)。会期情報フォーム + この定例会に紐づく日程の一覧 + 「この定例会に日程を追加」ボタン(`/admin/meetings/new?regular_session_id=`、P2-3) |
| `GET /admin/agenda-items` | 議題一覧(予約中バッジ付き、`?fiscal_year=&category=` で絞り込み、1.11追加)+ 登録/編集フォーム（`published_at` は `<input type="datetime-local">`、未指定なら現在時刻 = 即時公開。§3.4）。登録フォームには「登録して続けて入力」ボタンがあり、成功時に年度・種類を引き継いで同フォームへ戻る(1.11、絞り込みと同じクエリキーを共用) |
| `GET /admin/announcements` | お知らせ一覧（予約中バッジ付き）+ 登録/編集フォーム（`published_at` は `<input type="datetime-local">`、未指定なら現在時刻 = 即時公開） |
| `GET /admin/meetings` `GET /admin/meetings/new` `GET /admin/meetings/:id/edit` `POST /admin/meetings/:id/delete` | 日程管理。定例会・議題・資料の紐付け UI。一覧は `?month=&regular_session_id=` で絞り込み可能(1.11追加)。議題・資料チェックリストはインクリメンタル絞り込み(JS)・表示順自動採番(JS)・資料のその場アップロード・議題のクイック作成に対応(1.11、§6.3・§5.3参照) |
| `GET /admin/documents` `POST /admin/documents/:id/delete` | 資料一覧（`?q=&unlinked=on` でファイル名部分一致・議題未紐付けのみ絞り込み、1.11追加）+ アップロードフォーム。削除は他マスタと同じ SSR フォーム POST（§5.3 補足） |
| `GET /admin/votes` | 賛否記録対象の会議一覧（議題が紐づく会議ごとに議題数を表示、1.6追加） |
| `GET /admin/votes/:meetingId` `POST /admin/votes/:meetingId` | 賛否記録(一括入力)。縦軸=その会議の議題、横軸=議員のマス目(スプレッドシート形式)で、セルごとに賛成/反対/棄権/欠席/未記録を選択しまとめて送信する（1.6追加） |

フォーム送信は同一パスへの `POST`（`_method=delete` 等は使わず、削除は専用 `POST /admin/xxx/:id/delete`）。成功時は PRG パターンでリダイレクトし、リダイレクト先 URL に `?flash=created|updated|deleted` を付与して保存/削除の成功をバナー表示する(1.11追加、`src/lib/flash.ts`。値は固定の列挙のみ許可し、`/admin/*` は `private, no-store` のためキャッシュ汚染の懸念はない)。

### 5.3 管理 API（JSON・要認証）

管理画面の動的部分のうち、資料アップロードのみ API 化する（当初案では資料検索・議題検索も API 化する予定だったが、フェーズ5実装時に §6.3 のとおり方針変更したため以下は現状に合わせて更新済み）。

| メソッド/パス | 内容 |
|------|------|
| `POST /api/admin/documents` | `multipart/form-data` でファイル受領 → R2 `put` → `documents` に INSERT。`Accept: application/json` のときはメタデータ JSON を返し、それ以外（JS 無効時の通常フォーム送信）は `/admin/documents` へ 302 リダイレクトする二重対応。1.11 で日程フォームのその場アップロード UI から fetch されるようになった |
| `GET /api/admin/meetings?date=&exclude=` | 指定日の他会議一覧（日程編集画面で開始方法「前の会議終了後」を選んだ際に fetch で取得。§6.3） |
| `POST /api/admin/agenda-items` | 1.11追加。JSON body(`title`/`fiscal_year`/`number`/`category`/`agenda_type_id`)を既存の `agendaItemSchema` でそのまま検証し、`src/lib/agendaItems.ts` の `createAgendaItem` で INSERT + `logAdminMutation` を SSR ルート(`POST /admin/agenda-items`)と共用する。日程フォームの議題セクションから「クイック作成」される議題は常に即時公開固定(予約公開したい場合は `/admin/agenda-items` の通常フォームを使う)。下記の「実装していない」検索 API とは別物 — こちらは新規作成専用の API |

資料削除は JSON API ではなく `POST /admin/documents/:id/delete`（他マスタと同じ SSR フォーム POST パターン、§5.2）で実装している。`GET /api/admin/documents?q=` と `GET /api/admin/agenda-items?q=&year=`（資料検索・議題検索の部分一致 API)は実装していない — 日程編集画面の資料/議題選択は検索付きセレクトではなく、全件を表示するチェックボックスリスト + 表示順の手入力(1.11でインクリメンタル絞り込み・自動採番を JS で追加、§6.3 参照)のままとした。一覧の絞り込みは 1.11 で SSR の GET クエリ(`?q=` 等、JS 不要)として `/admin/agenda-items` `/admin/meetings` `/admin/documents` に追加済み(§5.2)。件数が数百件規模になった場合は改めてこの API 化を検討する。

ログイン/ログアウトは JSON API ではなく `/admin/login` `/admin/logout` への通常の SSR フォーム POST として実装する（§5.2）。better-auth を撤去したため `/api/auth/*` は存在しない。

**アップロード仕様**
- 許可拡張子: `pdf, docx, xlsx, pptx, csv, txt`（ホワイトリスト。MIME も検証）
- 1 ファイルのサイズ上限: 50 MB（Workers のリクエスト上限 100 MB 以内）
- **総容量クォータ**: `SUM(documents.file_size) + 新規サイズ` が `STORAGE_QUOTA_BYTES`（§9.2、初期値 1 TB）を超える場合は 422 で拒否
- R2 キー: `documents/<year>/<ulid>.<ext>`（元ファイル名は DB のみに保持し、キーには使わない — 日本語ファイル名・重複対策）

> **判断: Worker 経由配信 vs R2 直接公開URL**
> R2 はどちらの方式でもエグレス無料・読み取り(Class B)課金は同額のため、費用面の差はほぼ無い。差が出るのは Worker のリクエスト課金分だけだが、これは Cache Rules（§9.1）を `/documents/*/file` にも適用することで実質的に解消できる（キャッシュヒット時は Worker 自体が起動しない＝直接公開URLとほぼ同じコスト構造になる）。
> 一方 Worker 経由なら、①R2 キーが ULID で非推測性を持つことに加えて DB 側の可視性フラグで判定できる（§12 未決事項「資料の公開タイミング」— 会議当日まで非公開にする要件が出ても `documents.published_at` を足すだけで対応可）、②削除済み資料の 404 判定、③ファイル名の安全なエンコード（§10 セキュリティ監査 4章）を一箇所に集約できる、という利点を失わない。
> 以上より **Worker 経由配信を維持**し、コスト対策は配信方式ではなくキャッシュ側で行う。

### 5.4 エラー応答

- SSR: 404 / 500 の専用ページ。
- API: `{ "error": { "code": "validation_failed", "message": "...", "fields": {...} } }` を 400/401/404/422 で返す。

---

## 6. 画面設計

### 6.1 デザイン方針（DADS 準拠）

- カラー・タイポグラフィ・スペーシングは DADS v2.12.0 のトークンを CSS カスタムプロパティとして `public/assets/tokens.css` に書き出して使用する。値は design-system-mcp の `get_color_tokens` / `get_typography_spec` / `get_spacing_tokens` で取得する。
- コンポーネント（ボタン・フォーム・テーブル・パンくず・ノーティフィケーション）は `get_component_spec` の Do/Don't とアクセシビリティ要件に従って実装する。
- コントラストは `validate_color_usage` で WCAG AA を確認してから採用する。
- 対象は高齢者を含む一般市民。本文 16px 以上、タップターゲット 44px 以上、キーボード操作可能、`lang="ja"`。

### 6.2 公開側の主要画面

**トップ `/`**
```
┌ ヘッダー: 自治体名 議会 │ 日程 議題 委員会 議員 お知らせ ┐
│ [開会中] 令和8年第2回定例会 6/1〜6/25            │
│ ── お知らせ ────────────────────────            │
│ 7/05 第2回定例会の会議資料を公開しました ▶詳細   │
│ ── 今後の日程 ──────────────────────            │
│ 7/10(金) 09:30  本会議                ▶詳細      │
│ 7/10(金) 本会議終了後  総務常任委員会  ▶詳細      │
│ 7/14(火) 10:00  文教常任委員会        ▶詳細      │
└ フッター: 運営情報 ─────────────────────────────┘
```

**会議詳細 `/meetings/:id`**
```
┌ 本会議 │ 7/10(金) 09:30〜 │ 令和8年第2回定例会          ┐
│ 日程: ○○○○○○○○○○○○○○○○○○○（改行保持）      │
│                                                          │
│ ── この会議の議題 ──────────────────────             │
│ ・議案第5号 令和8年度一般会計補正予算              ▶詳細 │
│    └ 資料: 議案第5号説明資料.pdf (1.2MB)               │
│ ・請願第2号 ○○に関する請願                        ▶詳細 │
│    └ 資料: 請願第2号.pdf (0.4MB)                       │
│                                                          │
│ ── 会議資料（次第・会議録など） ──────────           │
│ ・次第.pdf (0.1MB)                                      │
└──────────────────────────────────────────────────────────┘
```
- 会議名（本会議 or 委員会名）/ 開催日 / 開始（時刻 or「〇〇終了後」）/ 所属定例会
- 日程テキスト（改行を保持して表示）
- この会議の議題（`meeting_agenda_items` 経由）: 議題名・種類・(議題ごとの)資料へのリンク。各議題名は `/agenda-items/:id` へリンク。未公開議題は一覧に出さない（§3.4）
- 会議資料（`meeting_documents` 経由、議題非依存）: ファイル名・サイズ・拡張子アイコンのリスト。クリックでダウンロード/表示

**議題一覧 `/agenda-items`**（1.10追加）
```
┌ 議題一覧(議案検索) ─────────────────────────────┐
│ キーワード [__________]  年度 [すべて▾]  種類 [すべて▾]  [絞り込む] │
│ ──────────────────────────────────────           │
│ 2026年度 議案 第1号 令和8年度一般会計補正予算(第2号) ▶詳細 │
│ 2025年度 請願 第1号 学校給食費無償化に関する陳情     ▶詳細 │
└──────────────────────────────────────────────────┘
```
- 検索フォームは `GET` の通常 `<form>`(JS 不要)。キーワード・年度・種類は自由に組み合わせ可能（`AND` 条件）
- キーワードは議題名の部分一致（`LIKE`、§8 のとおり `%` `_` をエスケープ）。年度の選択肢は公開済み議題の年度の一覧から動的に生成
- `published_at <= now` の議題のみ一覧表示（§3.4）。ゾーンの Cache Rules はクエリ文字列込みのフル URL 単位でキャッシュするため、検索条件の組み合わせごとに個別にキャッシュされる（§9.1）

### 6.3 管理側の主要画面

**日程登録・編集 `/admin/meetings/new`**（本システムで最も複雑なフォーム）

| 項目 | UI | 挙動 |
|------|----|------|
| 会議種別 | ラジオ: 本会議 / 委員会 | 「委員会」選択時のみ委員会セレクトを表示（vanilla JS。両方常に DOM 上には存在し、サーバ側バリデーションで担保） |
| 委員会 | セレクト（is_active=1 のみ） | |
| 定例会 | セレクト（任意） | ※当初案にあった「開催日が会期内かの警告表示」は実装していない（保存は常に可） |
| 開催日 | `<input type="date">` | |
| 開始 | ラジオ: 時刻指定 / 前の会議終了後 | 「終了後」選択時は同日の他会議セレクトに切替（JS。同日会議は `GET /api/admin/meetings?date=&exclude=` で fetch 取得） |
| 日程 | `<textarea>` | |
| 議題 | 年度で `<details>` グルーピングしたチェックボックス + 表示順の数値入力 | 1.11: 上部のテキスト入力でインクリメンタル絞り込み(JS、client-side、fetch不要。チェック済み行は絞り込みに関係なく常に表示)。当年度(最新の年度グループ)のみ初期展開。チェックを入れた時点で表示順が0/空なら「現在のチェック済み最大値+1」を自動セット、外したら0に戻す(JS、手入力での上書きも可能)。予約中の議題も選択可能（選択した時点では公開されず、`published_at` 到来まで会議詳細にも出ない）。JS無効時は絞り込み・自動採番なしで全件表示のまま(方針§2準拠) |
| 会議資料 | 全件チェックボックス + 表示順の数値入力 | 1.11: 議題と同じインクリメンタル絞り込み・表示順自動採番に対応。さらに「ここでアップロード」インライン UI(JS)を追加 — 既存 `POST /api/admin/documents`(Accept: application/json)を fetch で呼び、日程フォーム自体は未送信のままチェックリストに行を動的追加してチェック済み+表示順自動採番にする。JS無効時はインライン UI を隠し、`/admin/documents` へのリンク文言を表示する |
| 議題(クイック作成) | 最小フィールド(議題名/年度/番号/種類、種類=議案のときのみ議案種別▾)のインライン作成 UI(JS) | 1.11追加。`POST /api/admin/agenda-items`(§5.3)を fetch し、成功したら議題チェックリストへ動的追加(その場アップロードと同型)。`published_at` は常に即時公開固定(予約公開したい場合は `/admin/agenda-items` の通常フォームを使う。UI を単純に保つため) |

**資料管理 `/admin/documents`**: 一覧（ファイル名/サイズ/議題/登録日、`?q=&unlinked=on` でファイル名部分一致・議題未紐付けのみ絞り込み、1.11追加、GET フォームで JS 不要）、アップロードフォーム（ファイル + 議題セレクト任意）、削除（`POST /admin/documents/:id/delete`）。※当初案にあった「使用中(会議に紐付いている場合)の確認ダイアログに使用先を表示」は実装していない（汎用の削除確認ダイアログのみ）。

**議題管理 `/admin/agenda-items`**: 種類ラジオの選択に応じて「議案種別セレクト」（種類=議案のとき）と「委員会セレクト」（種類=委員会のとき）を出し分け（JS 無効時は両方表示し、サーバ側バリデーションで担保）。予定公開日時（`published_at`、`<input type="datetime-local">`、未指定なら現在時刻＝即時公開）を持ち、一覧では未来日時の行に「予約中」バッジを付ける（announcements と同一パターン、§3.4）。1.11: 一覧に `?fiscal_year=&category=` の絞り込み(GET フォーム)を追加し、登録フォームの「登録して続けて入力」ボタンと同じクエリキーを共用する(絞り込んだ文脈のまま同年度・同種類の議題を連続登録できる)。

**議員・委員会・定例会の詳細ハブページ**(1.11追加、admin-ux-improvement-plan.md P2): 「1テーブル=1画面」だった所属系マスタを、業務の主役(議員・委員会・定例会)を起点にしたハブへ再編した。「委員会所属」「会派所属」の単独ナビ項目は廃止し(URLは維持)、ハブ内のその場追加フォーム・「終了する」1クリック操作に統合している。

- **議員詳細ハブ `/admin/members/:id`**: 基本情報フォーム + 会派所属の履歴(その場追加フォーム、現所属のみ「終了する」ボタンで `term_end` に本日を1クリックセット)+ 委員会所属の履歴(同様)。「編集」「削除」は既存の横断一覧(`/admin/faction-memberships` `/admin/memberships`)へのリンクを再利用し、ロジックを二重実装しない。
- **委員会詳細ハブ `/admin/committees/:id`**: 基本情報フォーム + 現在の委員構成(役職順: 委員長→副委員長→委員→議席番号順)+ 過去の委員(`<details>` で折りたたみ)+ その場追加フォーム。改選時の一括入替ウィザードはスコープ外(頻度が低いため、実運用の声を見て判断)。
- **定例会詳細ハブ `/admin/sessions/:id`**: 会期情報フォーム + この定例会に紐づく日程の一覧(日付順)+ 「この定例会に日程を追加」ボタン(`/admin/meetings/new?regular_session_id=` で定例会をプリセットし、選び直す手間と選び忘れをなくす)。

**ダッシュボード `/admin`**(1.11刷新): 「マスタ名+件数」の一覧表(ナビと重複するため廃止)から、業務起点の4ブロックへ置き換えた — 直近の日程(既存踏襲)/ 賛否が未記録の終了済み会議(開催日が過去かつ紐づく議題に1件も `agenda_item_votes` がない会議、賛否記録画面への直リンク付き)/ 予約中の議題・お知らせ(`published_at` が未来の行、編集画面への直リンク付き)/ ストレージ使用量バー(資料管理画面の表示を再利用)。

**賛否記録 `/admin/votes`**（1.6 追加）: 議題が紐づく会議の一覧を表示する。`/admin/votes/:meetingId` は縦軸にその会議の議題（`meeting_agenda_items`、表示順）、横軸に議員（議席番号順）を並べたグリッドで、セルごとにセレクトで賛成/反対/棄権/欠席/未記録を選び、ページ全体を一度に送信する（エクセルのような一括入力 UI）。各議題の行には「全員賛成」等のクイック入力ボタンを備える（JS、無効時はセルを1つずつ選択すればよい）。「未記録」を選んだセルは当該会議×議題×議員の賛否記録を削除する（既存の記録を明示的に取り消せるようにするため）。1.11 のダッシュボード改修はスコープ外(手を入れていない、既に完成度が高いため)。

---

## 7. ディレクトリ構成

```
open_gikai/
├── idea.md
├── docs/
│   └── design.md                 ← 本書
├── .claude/
│   └── skills/
│       └── security-audit/
│           └── SKILL.md          ← セキュリティ監査スキル（§10・§11 で実行）
├── design-system-mcp/            ← DADS 参照用 MCP サーバー（既存・変更しない）
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── migrations/                   ← wrangler d1 migrations
│   ├── 0001_init.sql
│   └── 0002_auth.sql             ← admin_users / admin_sessions（手書き、§3.2.1）
├── public/                       ← Workers Static Assets
│   └── assets/
│       ├── tokens.css            ← DADS デザイントークン
│       ├── style.css
│       ├── app.js                ← 公開側 JS（最小限）
│       └── admin.js              ← 管理側 JS（フォーム出し分け・アップロード）
├── src/
│   ├── index.tsx                 ← Hono アプリのエントリ
│   ├── env.d.ts                  ← Bindings 型定義
│   ├── lib/
│   │   ├── auth.ts               ← パスワードハッシュ/セッション発行検証 + 認証・CSRF(Origin検証)ミドルウェア（§4）
│   │   ├── cache.ts              ← 公開 GET に Cache-Control ヘッダーを付与する薄いミドルウェア（実TTL強制はゾーンのCache Rulesが正、§9.1）。/admin/* /api/* には noStore（private, no-store）を付与するバックストップも含む（フェーズ3の監査で追加）
│   │   ├── db.ts                 ← D1 クエリヘルパ
│   │   └── meetings.ts           ← 同日会議の並び替え・循環検出ロジック
│   ├── routes/
│   │   ├── public/               ← §5.1 の各ルート
│   │   ├── admin/                ← §5.2 の各ルート
│   │   └── api/                  ← §5.3 の各ルート
│   ├── views/
│   │   ├── layout.tsx            ← 共通レイアウト（公開/管理）
│   │   ├── public/*.tsx
│   │   └── admin/*.tsx
│   └── validators/               ← Zod スキーマ（フォーム/API 共用）
├── scripts/
│   ├── create-admin.ts           ← 管理者アカウント作成
│   ├── seed-demo.ts              ← デモデータ投入（1.7追加。D1 リセット+投入、資料 R2 実体のアップロードまで行う）
│   └── seed-demo.sql             ← デモデータ本体（DELETE + INSERT）。seed-demo.ts から適用
└── tests/
    ├── unit/                     ← Vitest（並び替え・バリデーション）
    └── integration/              ← @cloudflare/vitest-pool-workers（ルート疎通）
```

---

## 8. バリデーション方針

- 全フォーム/APIは Zod スキーマで検証し、SSR フォームと JSON API で同一スキーマを共用する。
- DB の `CHECK` 制約は最後の砦。ユーザー向けエラーメッセージはアプリ層で返す。
- 代表的な業務ルール:
  - 議題: 種類=議案 ⇒ 議案種別必須 / 種類=委員会 ⇒ 委員会必須（それ以外は両方 NULL）。公開側クエリ・直接経路（`meeting_agenda_items`）・間接経路（`documents.agenda_item_id`）はすべて `published_at <= now` フィルタを通す（§3.4）。公開一覧のキーワード検索（`?q=`）は `src/lib/db.ts` の `containsPattern` で `%` `_` をエスケープしてから `LIKE ? ESCAPE '\'` に bind する（1.10追加。生のワイルドカードを許すと意図しない全件一致になるため）
  - 日程: 開始=時刻指定 ⇒ `start_time` 必須 / 開始=終了後 ⇒ 同日・非自己・非循環の `previous_meeting_id` 必須
  - 定例会: `start_date <= end_date`
  - 委員会所属: 同一議員×同一委員会で任期期間が重複しないこと（アプリ層で判定）
  - 会派所属: 同一議員の所属期間が重複しないこと（同時所属は 1 会派のみ）
  - お知らせ: `related_url` は `http:`/`https:` のみ許可。公開側クエリは必ず `published_at <= now` フィルタを通す（§3.4）
  - 賛否記録（1.6追加）: `vote_result` は `for`/`against`/`abstain`/`absent` のいずれか。記録先の `(meeting_id, agenda_item_id)` が `meeting_agenda_items` に存在しない組み合わせは 400 で拒否する（DB の複合外部キーとアプリ層の両方で担保）。公開側は `agenda_items.published_at <= now` でない議題の賛否を一切表示しない

---

## 9. コスト管理（予算スパイク対策）

自治体運用のため、**月額費用の予見性**を最優先する。従量課金が想定外に膨らむ経路（D1 読み取り、Workers リクエスト、R2 ストレージ）をそれぞれ設計で塞ぐ。

### 9.1 ゾーンレベル Cache Everything（Worker 起動そのものを止める）

**方式変更（1.1→1.2）**: 当初案の Workers Cache API（`caches.default`、コード内キャッシュ）は「D1 クエリは省けるが Worker は毎回起動し課金対象になる」レベルの節約に留まる。**Cloudflare Cache Rules で Cache Everything をゾーンレベルに設定し、キャッシュヒット時は Worker を一切起動しない方式に切り替える。** ボット巡回やアクセス急増のスパイクをエッジで完全に吸収できるため、こちらを一次防御とする。

**設定（Cloudflare ダッシュボード → Rules → Cache Rules。コードではなくインフラ設定。§9.4 のデプロイ手順に含める）**

| 優先順 | マッチ条件 | 動作 |
|-------|-----------|------|
| 1（最優先） | `http.request.uri.path starts_with "/admin"` OR `starts_with "/api"` OR `http.cookie contains "gikai_session"` | **Bypass cache**（Worker に必ず到達させる） |
| 2 | `http.request.uri.path starts_with "/documents/" and ends_with "/file"` | Cache Eligible、Edge TTL **1 日**（資料ファイルは中身が不変なので長め） |
| 3（残り全部） | それ以外の全パス | Cache Eligible、Edge TTL **30 分（1800 秒）** |

運用ルール:

- ルール 1 の Bypass 条件が**必ず**ルール 2・3 より高優先度であること。ここが漏れると管理画面やセッション情報がエッジにキャッシュされ、他の利用者に配信される重大インシデントになる。デプロイ時と `/security-audit` 実行時に必ず確認する（監査手順は SKILL.md 側にも追記済み）。
- アプリ側（`src/lib/cache.ts`）はキャッシュの読み書きを行わず、レスポンスに `Cache-Control: public, max-age=1800`（資料は `max-age=86400, immutable`）ヘッダーを付与するだけの薄い実装にする。実際の TTL 強制はダッシュボードの Edge TTL 設定側が正とし、アプリのヘッダー漏れがあってもゾーン設定でカバーされるようにする（コード側のバグをインフラ側で吸収する二重化）。
- 逆方向のバックストップとして、`/admin/*` `/api/*` には `noStore` ミドルウェアで `Cache-Control: private, no-store` を明示的に付与する（フェーズ3のセキュリティ監査で追加。ゾーンの Cache Rules Bypass 設定に不備があっても、Set-Cookie を含む管理系応答がキャッシュされないようにする）。
- 管理画面での更新は**公開側へ最大 30 分（資料は最大 1 日）遅れて反映**される。これは仕様として許容し、管理画面のヘッダーに「公開サイトへの反映には最大30分（資料は最大1日）かかります」と明記する。
- 即時反映が必要な緊急時は、Cloudflare ダッシュボードのゾーン全体パージ（Purge Everything）で対応する運用とする。
- ワイルドカードでない自治体独自ドメイン（例: gikai.example.jp）をゾーンとして Cloudflare に追加していることが前提。`*.workers.dev` サブドメインのみの場合 Cache Rules は使えないため、本番運用は必ずカスタムドメインで行う。

### 9.2 ストレージ総容量クォータ（R2 費用の上限化）

- 環境変数 `STORAGE_QUOTA_BYTES` で総容量上限を設定する。**初期値: 1 TB**（`1099511627776`）。wrangler.jsonc の `vars` に定義し、自治体の予算に応じて変更可能。
- アップロード時に `SELECT SUM(file_size) FROM documents` と新規ファイルサイズの合計がクォータを超えないか検証し、超える場合は 422（`storage_quota_exceeded`）で拒否する。
- 管理ダッシュボードに使用量バー（使用量 / クォータ、90% 超で警告色）を表示する。
- これにより R2 ストレージ費用の上限が確定する（1 TB ≒ $15/月。R2 はエグレス無料のためダウンロード急増で費用は増えない）。

### 9.3 リクエスト起因のスパイク対策

- **Bot Fight Mode を有効化する**（Cloudflare ダッシュボード → Security → Bots）。無料プランでも利用可能。悪質ボットにチャレンジ/ブロックを行い、正規の検索エンジンクローラー（Googlebot 等）は自動的に許可されるため公開サイトの被検索性には影響しない。Cache Everything（§9.1）の手前で効くため、キャッシュされていない URL への初回アクセスを大量に叩くタイプのボットにも有効。
- Cloudflare の **WAF レートリミットルール**を `/documents/*/file` と `/api/*` に設定する（例: 同一 IP から 60 秒に 100 リクエストで 429）。Cache Rules・Bot Fight Mode をすり抜けた分（初回アクセス・キャッシュ除外パス）への対策。
- Cloudflare の **Billing / Usage 通知**を有効化し、Workers リクエスト数・D1 行読み取り数が想定（後述の目安）を超えたらメール通知する。
- 費用目安（Workers Paid $5/月プラン想定）: Cache Everything により公開ページ・資料ダウンロードのキャッシュヒット時は Worker が起動しないため、D1 読み取り・Workers リクエスト数ともに実アクセス数よりずっと小さい「キャッシュミス数」相当に抑えられ、D1 無料枠（250 億行読み取り/月）を大きく下回る。想定固定費は **Workers Paid $5 + R2 使用量（上限 $15）≒ 月 $20 以内**。

### 9.4 デプロイ時のインフラ設定チェックリスト

§9.1・9.3 はコードではなく Cloudflare ダッシュボード（または Terraform 等の IaC、導入する場合）側の設定であり、`git` の差分に現れないため、実装フェーズ 1（基盤）と 7（仕上げ）の完了条件に明示的に含める。

- [ ] カスタムドメインをゾーンとして Cloudflare に追加済み（`*.workers.dev` のみで本番運用しない）
- [ ] Cache Rules: 管理系/API/Cookie 付きリクエストの Bypass ルールが、Cache Everything ルールより**高優先度**で設定されている
- [ ] Cache Rules: `/documents/*/file` に Edge TTL 1 日、それ以外の公開パスに Edge TTL 30 分が設定されている
- [ ] Bot Fight Mode: 有効化済み
- [ ] WAF レートリミットルール: `/documents/*/file` `/api/*` に設定済み
- [ ] Billing / Usage 通知: 有効化済み

---

## 10. 非機能要件

| 項目 | 内容 |
|------|------|
| アクセシビリティ | WCAG 2.1 AA（DADS 準拠で担保）。JS 無効でも閲覧可能 |
| パフォーマンス | SSR ページは 1 クエリ〜数クエリで構成（N+1 禁止、JOIN で取得）。公開ページはゾーンレベル Cache Everything でヒット時 Worker 非起動（§9.1） |
| コスト | 予算スパイク対策は §9 に集約（Cache Everything / 1 TB クォータ / Bot Fight Mode / レートリミット / 使用量アラート） |
| セキュリティ | 管理系は認証必須 / CSRF は自前 `requireSameOrigin` ミドルウェアの origin チェック + SameSite Cookie（§4） / アップロードは拡張子・MIME・サイズのホワイトリスト / R2 直リンク禁止（Worker 経由配信） / SQL は必ず prepared statement |
| セキュリティ監査 | プロジェクトスキル `/security-audit`（[.claude/skills/security-audit/SKILL.md](../.claude/skills/security-audit/SKILL.md)）で SQL インジェクション・XSS・認可漏れ等を静的に監査する。実行タイミングは §11 の各フェーズ完了時（最低でもフェーズ 3・4・5・7 の完了条件に含める）と、以降の機能追加 PR ごと。指摘は修正するまでフェーズ完了としない |
| ログ | Workers Logs（`wrangler tail`）。管理操作（作成/更新/削除）は `console.log` に構造化 JSON（`{event:"admin_mutation", admin_email, table, record_id, action}`）で残す。実装は `src/lib/auditLog.ts` の `logAdminMutation`、全管理ルートの作成/更新/削除ハンドラから呼び出す。DB への永続化は行わない（画面から過去ログを検索したい要件が出た場合は改めてテーブル化を検討） |
| バックアップ | D1 の Time Travel（30 日）を利用。R2 はバージョニング不要（削除は管理画面からのみ） |

---

## 11. 実装フェーズ

| フェーズ | 内容 | 完了条件 |
|---------|------|---------|
| 1. 基盤 | wrangler 設定、Hono 雛形、D1 マイグレーション 0001、レイアウト + DADS トークン CSS、カスタムドメインのゾーン追加 | `wrangler dev` でトップページが表示される |
| 2. マスタ CRUD | 委員会・定例会・議案種別・議員・会派・委員会所属・会派所属・お知らせの管理画面（認証なしで仮実装） | 各マスタが画面から登録・編集・削除できる |
| 3. 認証 | 自前 ID/PASS 認証実装（0002 マイグレーション、`src/lib/auth.ts`）、`/admin/*` 保護、CSRF(Origin検証)、管理者作成スクリプト | ログインしないと管理画面に入れない + `/security-audit` 指摘ゼロ |
| 4. 議題・資料 | 議題 CRUD（予約公開含む、§3.4）、R2 アップロード/削除、資料一覧、容量クォータ（§9.2） | PDF をアップロードし議題に紐付けられる + クォータ超過が 422 になる + 未公開議題が `/agenda-items` に出ない + `/security-audit` 指摘ゼロ |
| 5. 日程管理 | 日程 CRUD、「前の会議終了後」ロジック、議題紐付け（`meeting_agenda_items`）、資料紐付け | 1 日に複数会議をチェーン登録できる + 会議詳細から紐づく議題と資料を確認できる + 未公開議題が `/meetings/:id` に出ない + `/security-audit` 指摘ゼロ |
| 5.5 賛否記録（1.6追加） | `agenda_item_votes`（0003 マイグレーション）、`/admin/votes` 一覧・記録画面 | `meeting_agenda_items` の組ごとに議員全員分の賛成/反対/棄権/欠席を記録・編集できる + 存在しない組み合わせへの記録が拒否される + `/security-audit` 指摘ゼロ |
| 6. 公開画面 | トップ・日程一覧/詳細・議題（賛否結果含む）・委員会・議員・お知らせ・資料 DL | JS 無効ブラウザで全公開ページが閲覧できる + 予約公開前のお知らせ・議題（とその賛否）が表示されない |
| 7. 仕上げ | エラーページ、Cache Rules / Bot Fight Mode / レートリミット設定（§9.4 チェックリスト）、テスト整備、本番デプロイ | integration テスト green + `/security-audit` 全項目パス + §9.4 チェックリスト全項目済み + 本番 URL で動作 |

各フェーズ末に `npm test`（Vitest）と `wrangler dev` での手動確認を行う。フェーズ 3〜5・5.5・7 の完了条件にはセキュリティ監査スキル（§10）の実行を含み、指摘が残っている間は次フェーズへ進まない。フェーズ 7 は §9.4 のインフラ設定チェックリストがすべて完了するまで完了扱いにしない。

---

## 12. 未決事項（実装前に確認）

1. **議案種別の解釈**: §3.2 補足のとおり「種類=議案のときのみ議案種別を選択」と解釈した。相違があれば要修正。
2. **自治体名・ドメイン**: レイアウトのヘッダー表記と `APP_URL` に必要。
3. ~~**資料の公開タイミング**~~ → 解決済み（1.6、フェーズ6実装時）。`documents.published_at` 列は追加せず、`GET /documents/:id/file` が `agenda_item_id` が非 NULL の資料についてはその議題の `published_at <= now` を都度チェックする方式にした（`agenda_item_id` が NULL の会議全体資料は従来どおり即時公開）。理由: 議題一覧側では未公開議題の資料へのリンクを出していなかったが、`/documents/:id/file` を連番 ID で直接叩けば議題の公開状態を無視してダウンロードできてしまう抜け穴があったため（`/security-audit` フェーズ6実施時に発見・修正）。
4. **クォータ変更の運用**: `STORAGE_QUOTA_BYTES` の変更は wrangler.jsonc 編集 + 再デプロイで行う想定。管理画面から変更したい場合は設定テーブルを追加する。
5. ~~「カレンダー」の解釈~~ → 解決済み（1.4）。日程（`meetings`）と議題（`agenda_items`）を直接紐づける `meeting_agenda_items` を追加し、会議詳細 `/meetings/:id` から議題ごとの資料を確認できるようにした（§3.1・§3.2・§6.2）。
