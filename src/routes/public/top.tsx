import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { withPublished } from "../../lib/db";
import { Layout } from "../../views/layout";
import { TopPage, type TopAnnouncement, type TopMeeting, type TopSession } from "../../views/public/top";

export const topRoute = new Hono<AppEnv>();

topRoute.get("/", publicCache, async (c) => {
  const { DB } = c.env;

  const session = await DB.prepare(
    `SELECT id, name, start_date, end_date FROM regular_sessions
     WHERE start_date <= date('now') AND end_date >= date('now')
     LIMIT 1`
  ).first<TopSession>();

  const { results: meetings } = await DB.prepare(
    `SELECT m.id, m.meeting_type, m.date, m.start_type, m.start_time, c.name AS committee_name
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date >= date('now')
     ORDER BY m.date ASC, m.start_time ASC
     LIMIT 10`
  ).all<TopMeeting>();

  const { results: announcements } = await DB.prepare(
    `SELECT id, subject, published_at FROM announcements
     WHERE ${withPublished()}
     ORDER BY published_at DESC
     LIMIT 5`
  ).all<TopAnnouncement>();

  return c.html(
    <Layout title="トップ">
      <TopPage session={session ?? null} meetings={meetings} announcements={announcements} />
    </Layout>
  );
});
