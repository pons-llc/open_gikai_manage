import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { Layout } from "../../views/layout";
import { DashboardPage, type DashboardCounts, type UpcomingMeeting } from "../../views/admin/dashboard";

export const dashboardRoute = new Hono<AppEnv>();

dashboardRoute.get("/", async (c) => {
  const { DB } = c.env;
  const [committees, sessions, members, factions, announcements, agendaItems, documents, meetings] =
    await Promise.all([
      DB.prepare(`SELECT COUNT(*) AS n FROM committees`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM regular_sessions`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM members`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM factions`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM announcements`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM agenda_items`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM documents`).first<{ n: number }>(),
      DB.prepare(`SELECT COUNT(*) AS n FROM meetings`).first<{ n: number }>(),
    ]);
  const counts: DashboardCounts = {
    committees: committees?.n ?? 0,
    sessions: sessions?.n ?? 0,
    members: members?.n ?? 0,
    factions: factions?.n ?? 0,
    announcements: announcements?.n ?? 0,
    agendaItems: agendaItems?.n ?? 0,
    documents: documents?.n ?? 0,
    meetings: meetings?.n ?? 0,
  };

  const { results: upcomingMeetings } = await DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date, m.start_type, m.start_time
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date >= date('now')
     ORDER BY m.date ASC, m.id ASC
     LIMIT 5`
  ).all<UpcomingMeeting>();

  return c.html(
    <Layout title="ダッシュボード" variant="admin" adminEmail={c.get("adminEmail")}>
      <DashboardPage counts={counts} upcomingMeetings={upcomingMeetings} />
    </Layout>
  );
});
