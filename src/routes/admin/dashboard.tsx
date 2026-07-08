import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { getStorageUsageBytes } from "../../lib/storage";
import { getFlash } from "../../lib/flash";
import { Layout } from "../../views/layout";
import {
  DashboardPage,
  type ReservedItem,
  type UnrecordedVoteMeeting,
  type UpcomingMeeting,
} from "../../views/admin/dashboard";

export const dashboardRoute = new Hono<AppEnv>();

/**
 * P4: 「今日やること」ダッシュボード。マスタ件数の一覧表(ナビと重複)を廃止し、
 * 業務起点のブロック(直近の日程 / 賛否未記録の終了済み会議 / 予約中の議題・お知らせ / ストレージ使用量)に置き換える。
 */
dashboardRoute.get("/", async (c) => {
  const { DB } = c.env;

  const upcomingMeetingsPromise = DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date, m.start_type, m.start_time
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date >= date('now')
     ORDER BY m.date ASC, m.id ASC
     LIMIT 5`
  ).all<UpcomingMeeting>();

  // 開催日が過去で、紐づく議題のうち1件でも agenda_item_votes が記録されている会議は除外する。
  const unrecordedVoteMeetingsPromise = DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date < date('now')
       AND EXISTS (SELECT 1 FROM meeting_agenda_items mai WHERE mai.meeting_id = m.id)
       AND NOT EXISTS (
         SELECT 1 FROM meeting_agenda_items mai
         JOIN agenda_item_votes v ON v.meeting_id = mai.meeting_id AND v.agenda_item_id = mai.agenda_item_id
         WHERE mai.meeting_id = m.id
       )
     ORDER BY m.date DESC, m.id DESC
     LIMIT 10`
  ).all<UnrecordedVoteMeeting>();

  const reservedAgendaItemsPromise = DB.prepare(
    `SELECT id, title AS label, published_at, 'agenda_item' AS kind
     FROM agenda_items WHERE published_at > datetime('now')`
  ).all<ReservedItem>();

  const reservedAnnouncementsPromise = DB.prepare(
    `SELECT id, subject AS label, published_at, 'announcement' AS kind
     FROM announcements WHERE published_at > datetime('now')`
  ).all<ReservedItem>();

  const [upcomingMeetings, unrecordedVoteMeetings, reservedAgendaItems, reservedAnnouncements, usedBytes] =
    await Promise.all([
      upcomingMeetingsPromise.then((r) => r.results),
      unrecordedVoteMeetingsPromise.then((r) => r.results),
      reservedAgendaItemsPromise.then((r) => r.results),
      reservedAnnouncementsPromise.then((r) => r.results),
      getStorageUsageBytes(DB),
    ]);

  const reservedItems = [...reservedAgendaItems, ...reservedAnnouncements].sort((a, b) =>
    a.published_at.localeCompare(b.published_at)
  );

  return c.html(
    <Layout title="ダッシュボード" variant="admin" adminEmail={c.get("adminEmail")} flash={getFlash(c)}>
      <DashboardPage
        upcomingMeetings={upcomingMeetings}
        unrecordedVoteMeetings={unrecordedVoteMeetings}
        reservedItems={reservedItems}
        usedBytes={usedBytes}
        quotaBytes={Number(c.env.STORAGE_QUOTA_BYTES)}
      />
    </Layout>
  );
});
