-- デモデータ(scripts/seed-demo.ts から適用する)。
-- agenda_types(議案/報告/認定)は migrations/0001_init.sql で seed 済みのため触らない。
-- admin_users / admin_sessions もここではリセットしない(管理者アカウントは npm run create-admin で別管理)。
PRAGMA foreign_keys = ON;

DELETE FROM agenda_item_votes;
DELETE FROM meeting_documents;
DELETE FROM meeting_agenda_items;
DELETE FROM meetings;
DELETE FROM documents;
DELETE FROM agenda_items;
DELETE FROM committee_memberships;
DELETE FROM faction_memberships;
DELETE FROM members;
DELETE FROM factions;
DELETE FROM committees;
DELETE FROM regular_sessions;
DELETE FROM announcements;

-- ===== 委員会(1つ廃止済みを含む) =====
INSERT INTO committees (id, name, category, display_order, is_active) VALUES
  (1, '総務常任委員会', 'standing', 1, 1),
  (2, '教育福祉常任委員会', 'standing', 2, 1),
  (3, '建設経済常任委員会', 'standing', 3, 1),
  (4, '議会運営委員会', 'steering', 4, 1),
  (5, '予算特別委員会', 'special', 5, 1),
  (6, '旧・行財政改革特別委員会', 'special', 6, 0);

-- ===== 定例会(過去2件・直近閉会1件・開会中1件・未来1件) =====
INSERT INTO regular_sessions (id, name, start_date, end_date) VALUES
  (1, '令和6年第1回定例会', '2024-03-01', '2024-03-25'),
  (2, '令和7年第2回定例会', '2025-06-02', '2025-06-27'),
  (3, '令和8年第2回定例会', '2026-06-01', '2026-06-25'),
  (4, '令和8年臨時会',       '2026-07-01', '2026-07-15'),
  (5, '令和8年第3回定例会', '2026-09-10', '2026-09-30');

-- ===== 議員: 第1期(2019年当選、全員退任済み)+第2期(2023年当選、現任) =====
-- 「期」フィルタ(GET /members?term=)の動作確認用に is_active の異なる2つの当選年月日を用意する。
INSERT INTO members (id, name, election_count, elected_on, seat_number, is_active) VALUES
  (1, '佐藤一郎', 3, '2019-04-21', 1, 0),
  (2, '鈴木二郎', 2, '2019-04-21', 2, 0),
  (3, '高橋三郎', 4, '2019-04-21', 3, 0),
  (4, '田中四郎', 1, '2019-04-21', 4, 0),
  (5, '伊藤五郎', 2, '2019-04-21', 5, 0),
  (6,  '渡辺一美', 1, '2023-04-23', 1, 1),
  (7,  '山本二美', 2, '2023-04-23', 2, 1),
  (8,  '中村三美', 1, '2023-04-23', 3, 1),
  (9,  '小林四美', 3, '2023-04-23', 4, 1),
  (10, '加藤五美', 1, '2023-04-23', 5, 1),
  (11, '吉田六郎', 2, '2023-04-23', 6, 1),
  (12, '山田太郎', 1, '2023-04-23', 7, 1),
  (13, '木村七子', 1, '2023-04-23', 8, 1);

-- ===== 会派(現任議員のみ所属。木村七子は無所属のまま) =====
INSERT INTO factions (id, name, established_on, is_active) VALUES
  (1, '未来会議', '2023-05-01', 1),
  (2, '市民クラブ', '2023-05-01', 1),
  (3, '新政会', '2019-05-01', 1);

-- 山本二美は市民クラブ→未来会議に移籍した履歴を持たせる(会派所属の任期重複禁止ルールの確認用)。
INSERT INTO faction_memberships (id, faction_id, member_id, term_start, term_end) VALUES
  (1, 1, 6,  '2023-05-01', NULL),
  (2, 2, 7,  '2023-05-01', '2025-03-31'),
  (3, 1, 7,  '2025-04-01', NULL),
  (4, 2, 8,  '2023-05-01', NULL),
  (5, 2, 9,  '2023-05-01', NULL),
  (6, 3, 10, '2023-05-01', NULL),
  (7, 3, 11, '2023-05-01', NULL),
  (8, 1, 12, '2023-05-01', NULL);

-- ===== 委員会所属(現任議員が複数委員会を兼務するケースを含む) =====
INSERT INTO committee_memberships (id, committee_id, member_id, role, term_start, term_end) VALUES
  (1,  1, 6,  'chair',      '2023-05-15', NULL),
  (2,  1, 9,  'member',     '2023-05-15', NULL),
  (3,  1, 12, 'member',     '2023-05-15', NULL),
  (4,  2, 7,  'chair',      '2023-05-15', NULL),
  (5,  2, 10, 'member',     '2023-05-15', NULL),
  (6,  2, 13, 'member',     '2023-05-15', NULL),
  (7,  3, 8,  'chair',      '2023-05-15', NULL),
  (8,  3, 11, 'member',     '2023-05-15', NULL),
  (9,  3, 6,  'member',     '2023-05-15', NULL),
  (10, 4, 6,  'vice_chair', '2023-05-15', NULL),
  (11, 4, 7,  'member',     '2023-05-15', NULL),
  (12, 5, 9,  'chair',      '2023-05-15', NULL),
  (13, 5, 10, 'member',     '2023-05-15', NULL),
  (14, 5, 11, 'member',     '2023-05-15', NULL),
  (15, 5, 12, 'member',     '2023-05-15', NULL);

-- ===== 議題: 年度・種類・公開状態をひととおり網羅 =====
INSERT INTO agenda_items (id, title, fiscal_year, number, category, agenda_type_id, committee_id, published_at) VALUES
  (1,  '令和7年度一般会計予算',                              2025, 1, 'bill',      1,    NULL, '2025-03-01 09:00:00'),
  (2,  '市道路線認定について',                                2025, 2, 'bill',      1,    NULL, '2025-03-01 09:00:00'),
  (3,  '学校給食費無償化に関する陳情',                        2025, 1, 'appeal',    NULL, NULL, '2025-06-02 09:00:00'),
  (4,  '令和6年度一般会計歳入歳出決算の認定について',          2025, 3, 'bill',      3,    NULL, '2026-06-01 09:00:00'),
  (5,  '総務常任委員会所管事務調査報告',                      2025, 1, 'committee', NULL, 1,    '2026-06-01 09:00:00'),
  (6,  '令和8年度一般会計補正予算(第2号)',                    2026, 1, 'bill',      1,    NULL, '2026-06-01 09:00:00'),
  (7,  '子育て支援施設整備に関する請願',                      2026, 1, 'petition',  NULL, NULL, '2026-06-01 09:00:00'),
  (8,  '教育福祉常任委員会所管事務調査報告',                  2026, 1, 'committee', NULL, 2,    '2026-06-01 09:00:00'),
  (9,  '令和9年度予算編成方針について',                      2026, 2, 'bill',      2,    NULL, '2026-09-05 09:00:00'),
  (10, '市庁舎耐震化工事請負契約の締結について',              2026, 3, 'bill',      1,    NULL, '2026-09-05 09:00:00');

-- ===== 日程: 過去の定例会(採決まで完了)・同日チェーン・開会中の臨時会・未来の定例会 =====
INSERT INTO meetings (id, meeting_type, committee_id, regular_session_id, date, start_type, start_time, previous_meeting_id, schedule_text) VALUES
  (1, 'plenary',   NULL, 3, '2026-06-05', 'fixed',          '10:00', NULL, '本会議(開会・議案上程)'),
  (2, 'committee', 1,    3, '2026-06-12', 'fixed',          '13:30', NULL, '総務常任委員会(付託議案審査)'),
  (3, 'committee', 2,    3, '2026-06-12', 'after_previous', NULL,    2,    '教育福祉常任委員会(付託議案審査、総務常任委員会終了後)'),
  (4, 'plenary',   NULL, 3, '2026-06-25', 'fixed',          '10:00', NULL, '本会議(委員長報告・採決・閉会)'),
  (5, 'plenary',   NULL, 4, '2026-07-10', 'fixed',          '09:30', NULL, '本会議(臨時会)'),
  (6, 'committee', 3,    4, '2026-07-10', 'after_previous', NULL,    5,    '建設経済常任委員会(本会議終了後)'),
  (7, 'plenary',   NULL, 5, '2026-09-10', 'fixed',          '10:00', NULL, '本会議(開会)');

-- ===== 会議×議題の紐付け =====
INSERT INTO meeting_agenda_items (meeting_id, agenda_item_id, display_order) VALUES
  (1, 1, 0), (1, 6, 1),
  (2, 6, 0), (2, 5, 1),
  (3, 7, 0), (3, 8, 1),
  (4, 1, 0), (4, 6, 1), (4, 7, 2), (4, 4, 3),
  (7, 9, 0), (7, 10, 1);

-- ===== 資料(R2実体は scripts/seed-demo.ts が別途アップロードする) =====
INSERT INTO documents (id, r2_key, file_name, file_size, extension, content_type, agenda_item_id, created_at) VALUES
  (1, 'documents/2026/seed-demo-r7-budget.txt',       '令和7年度一般会計予算説明資料.txt',       120, 'txt', 'text/plain', 1,    '2025-03-01 09:05:00'),
  (2, 'documents/2026/seed-demo-r8-suppl-budget.txt', '令和8年度一般会計補正予算(第2号)説明資料.txt', 130, 'txt', 'text/plain', 6,    '2026-06-01 09:05:00'),
  (3, 'documents/2026/seed-demo-petition.txt',        '子育て支援施設整備請願書.txt',              110, 'txt', 'text/plain', 7,    '2026-06-01 09:10:00'),
  (4, 'documents/2026/seed-demo-agenda.txt',          '次第.txt',                                  60, 'txt', 'text/plain', NULL, '2026-06-05 09:00:00'),
  (5, 'documents/2026/seed-demo-minutes.txt',         '会議録.txt',                                200, 'txt', 'text/plain', NULL, '2026-06-25 12:00:00');

INSERT INTO meeting_documents (meeting_id, document_id, display_order) VALUES
  (1, 4, 0),
  (4, 5, 0);

-- ===== 賛否記録: 同じ議題(6号)を委員会採決→本会議採決の2段階で記録する例を含む =====
-- 総務常任委員会(meeting2)での付託審査採決(委員会メンバーのみ)
INSERT INTO agenda_item_votes (meeting_id, agenda_item_id, member_id, vote_result) VALUES
  (2, 6, 6,  'for'),
  (2, 6, 9,  'for'),
  (2, 6, 12, 'against');

-- 教育福祉常任委員会(meeting3)での請願採決(委員会メンバーのみ)
INSERT INTO agenda_item_votes (meeting_id, agenda_item_id, member_id, vote_result) VALUES
  (3, 7, 7,  'for'),
  (3, 7, 10, 'for'),
  (3, 7, 13, 'abstain');

-- 本会議(meeting4)での採決(現任議員8名の全会一致/賛否分かれ/欠席混在パターンを一通り含む)
INSERT INTO agenda_item_votes (meeting_id, agenda_item_id, member_id, vote_result) VALUES
  (4, 1, 6,  'for'), (4, 1, 7,  'for'), (4, 1, 8,  'against'), (4, 1, 9,  'for'),
  (4, 1, 10, 'abstain'), (4, 1, 11, 'for'), (4, 1, 12, 'for'), (4, 1, 13, 'absent'),
  (4, 6, 6,  'for'), (4, 6, 7,  'for'), (4, 6, 8,  'for'), (4, 6, 9,  'for'),
  (4, 6, 10, 'for'), (4, 6, 11, 'for'), (4, 6, 12, 'for'), (4, 6, 13, 'absent'),
  (4, 7, 6,  'for'), (4, 7, 7,  'for'), (4, 7, 8,  'against'), (4, 7, 9,  'for'),
  (4, 7, 10, 'for'), (4, 7, 11, 'against'), (4, 7, 12, 'for'), (4, 7, 13, 'for'),
  (4, 4, 6,  'for'), (4, 4, 7,  'for'), (4, 4, 8,  'for'), (4, 4, 9,  'for'),
  (4, 4, 10, 'for'), (4, 4, 11, 'for'), (4, 4, 12, 'for'), (4, 4, 13, 'for');

-- ===== お知らせ(公開済み3件+予約中1件) =====
INSERT INTO announcements (id, subject, body, related_url, published_at) VALUES
  (1, '令和8年度一般会計補正予算(第2号)が可決されました',
      '6月25日の本会議において、令和8年度一般会計補正予算(第2号)が原案のとおり可決されました。詳細は議題ページをご覧ください。',
      NULL, '2026-06-25 15:00:00'),
  (2, '議会だより最新号を発行しました',
      '議会だより第120号を発行しました。市内公共施設等で配布しているほか、ウェブサイトからもご覧いただけます。',
      'https://example.jp/gikaidayori/120', '2026-06-28 09:00:00'),
  (3, '臨時会(7月10日開催)のお知らせ',
      '7月10日に臨時会を開催します。本会議は9時30分から、引き続き建設経済常任委員会を開催します。',
      NULL, '2026-07-05 09:00:00'),
  (4, '次回定例会(9月)の日程について',
      '令和8年第3回定例会は9月10日開会予定です。詳細な日程は決定次第お知らせします。',
      NULL, '2026-08-20 09:00:00');
