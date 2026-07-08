PRAGMA foreign_keys = ON;

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
