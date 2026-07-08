import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { withPublished } from "../../lib/db";
import { Layout } from "../../views/layout";
import { NewsDetailPage, NewsListPage, type NewsDetail, type NewsListItem } from "../../views/public/news";

export const newsRoute = new Hono<AppEnv>();

newsRoute.get("/", publicCache, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, subject, published_at FROM announcements WHERE ${withPublished()} ORDER BY published_at DESC`
  ).all<NewsListItem>();
  return c.html(
    <Layout title="お知らせ">
      <NewsListPage items={results} />
    </Layout>
  );
});

newsRoute.get("/:id", publicCache, async (c) => {
  const id = Number(c.req.param("id"));
  const item = await c.env.DB.prepare(
    `SELECT id, subject, body, related_url, published_at FROM announcements WHERE id = ? AND ${withPublished()}`
  )
    .bind(id)
    .first<NewsDetail>();
  if (!item) return c.notFound();
  return c.html(
    <Layout title={item.subject}>
      <NewsDetailPage item={item} />
    </Layout>
  );
});
