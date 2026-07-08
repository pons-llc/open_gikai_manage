import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { getStorageUsageBytes } from "../../lib/storage";
import { getFlash } from "../../lib/flash";
import { Layout } from "../../views/layout";
import { DashboardPage, type ReservedItem, type UpcomingMeeting } from "../../views/admin/dashboard";

export const dashboardRoute = new Hono<AppEnv>();

/**
 * P4: 「今日やること」ダッシュボード。マスタ件数の一覧表(ナビと重複)を廃止し、
 * 業務起点のブロック(直近の日程 / 予約中の議題・お知らせ / ストレージ使用量)に置き換える。
 * 1.13: 賛否が未記録の会議ブロックは廃止(賛否記録への導線は日程一覧・日程編集画面のボタンに一本化済み)。
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

  const reservedAgendaItemsPromise = DB.prepare(
    `SELECT id, title AS label, published_at, 'agenda_item' AS kind
     FROM agenda_items WHERE published_at > datetime('now')`
  ).all<ReservedItem>();

  const reservedAnnouncementsPromise = DB.prepare(
    `SELECT id, subject AS label, published_at, 'announcement' AS kind
     FROM announcements WHERE published_at > datetime('now')`
  ).all<ReservedItem>();

  const [upcomingMeetings, reservedAgendaItems, reservedAnnouncements, usedBytes] = await Promise.all([
    upcomingMeetingsPromise.then((r) => r.results),
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
        reservedItems={reservedItems}
        usedBytes={usedBytes}
        quotaBytes={Number(c.env.STORAGE_QUOTA_BYTES)}
      />
    </Layout>
  );
});
