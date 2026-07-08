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
