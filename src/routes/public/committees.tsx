import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { Layout } from "../../views/layout";
import { CommitteesPage, groupCommitteeRows, type CommitteeMemberRow } from "../../views/public/committees";

export const committeesRoute = new Hono<AppEnv>();

committeesRoute.get("/", publicCache, async (c) => {
  // N+1 回避のため 1 クエリの JOIN でまとめて取得し、アプリ側で委員会ごとにグループ化する(design.md §10)。
  const { results } = await c.env.DB.prepare(
    `SELECT c.id AS committee_id, c.name AS committee_name, c.category,
            cm.role, mem.id AS member_id, mem.name AS member_name, mem.seat_number
     FROM committees c
     LEFT JOIN committee_memberships cm ON cm.committee_id = c.id AND cm.term_end IS NULL
     LEFT JOIN members mem ON mem.id = cm.member_id
     WHERE c.is_active = 1
     ORDER BY c.display_order ASC,
              CASE cm.role WHEN 'chair' THEN 0 WHEN 'vice_chair' THEN 1 ELSE 2 END,
              mem.seat_number ASC`
  ).all<CommitteeMemberRow>();

  return c.html(
    <Layout title="委員会一覧">
      <CommitteesPage groups={groupCommitteeRows(results)} />
    </Layout>
  );
});
