PRAGMA foreign_keys = ON;

-- 1.14: 管理一覧の絞り込み/並べ替えで効いていなかったインデックスを追加。
-- (meetings の月絞り込みは substr() 依存だったため、range 条件への変更で既存 idx_meetings_date を使う形に修正済み。
--  こちらは新規インデックスが必要な箇所のみ)

-- agenda_items: 種類(category)単体の絞り込み。UNIQUE(fiscal_year, category, number) は fiscal_year 先頭のため効かない。
CREATE INDEX idx_agenda_items_category ON agenda_items(category);

-- committee_memberships / faction_memberships: 一覧の ORDER BY term_start DESC, id DESC に一致させ、
-- ソートも含めてインデックスで完結させる。
CREATE INDEX idx_committee_memberships_term_start ON committee_memberships(term_start DESC, id DESC);
CREATE INDEX idx_faction_memberships_term_start ON faction_memberships(term_start DESC, id DESC);
