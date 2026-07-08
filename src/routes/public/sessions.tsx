import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { Layout } from "../../views/layout";
import { SessionsPage, type SessionListItem } from "../../views/public/sessions";

export const sessionsRoute = new Hono<AppEnv>();

sessionsRoute.get("/", publicCache, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, start_date, end_date FROM regular_sessions ORDER BY start_date DESC`
  ).all<SessionListItem>();
  return c.html(
    <Layout title="定例会一覧">
      <SessionsPage items={results} />
    </Layout>
  );
});
