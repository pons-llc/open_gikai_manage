import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { containsPattern, withPublished } from "../../lib/db";
import { Layout } from "../../views/layout";
import {
  AgendaItemDetailPage,
  AgendaItemsListPage,
  type AgendaItemDetail,
  type AgendaItemDocument,
  type AgendaItemListItem,
  type VoteMeetingResult,
} from "../../views/public/agendaItems";

export const agendaItemsRoute = new Hono<AppEnv>();

/**
 * ゾーンの Cache Rules(§9.1)はフルURL(クエリ文字列込み)単位でキャッシュするため、
 * ?q=&year=&category= の組み合わせごとに別々にキャッシュされる(publicCache のヘッダーもそれを前提にした薄い実装)。
 */
agendaItemsRoute.get("/", publicCache, async (c) => {
  const { DB } = c.env;
  const year = c.req.query("year") ?? "";
  const category = c.req.query("category") ?? "";
  const q = c.req.query("q") ?? "";

  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (year !== "") {
    conditions.push("fiscal_year = ?");
    binds.push(Number(year));
  }
  if (category !== "") {
    conditions.push("category = ?");
    binds.push(category);
  }
  if (q !== "") {
    conditions.push("title LIKE ? ESCAPE '\\'");
    binds.push(containsPattern(q));
  }
  const where = withPublished(conditions.length > 0 ? conditions.join(" AND ") : undefined);

  const { results: items } = await DB.prepare(
    `SELECT id, title, fiscal_year, number, category FROM agenda_items WHERE ${where}
     ORDER BY fiscal_year DESC, number DESC`
  )
    .bind(...binds)
    .all<AgendaItemListItem>();

  const { results: yearRows } = await DB.prepare(
    `SELECT DISTINCT fiscal_year FROM agenda_items WHERE ${withPublished()} ORDER BY fiscal_year DESC`
  ).all<{ fiscal_year: number }>();

  return c.html(
    <Layout title="議題一覧">
      <AgendaItemsListPage
        items={items}
        years={yearRows.map((r) => r.fiscal_year)}
        year={year}
        category={category}
        q={q}
      />
    </Layout>
  );
});

agendaItemsRoute.get("/:id", publicCache, async (c) => {
  const id = Number(c.req.param("id"));
  const { DB } = c.env;

  const item = await DB.prepare(
    `SELECT ai.id, ai.title, ai.fiscal_year, ai.number, ai.category,
            at.name AS agenda_type_name, c.name AS committee_name
     FROM agenda_items ai
     LEFT JOIN agenda_types at ON at.id = ai.agenda_type_id
     LEFT JOIN committees c ON c.id = ai.committee_id
     WHERE ai.id = ? AND ai.published_at <= datetime('now')`
  )
    .bind(id)
    .first<AgendaItemDetail>();
  if (!item) return c.notFound();

  const { results: documents } = await DB.prepare(
    `SELECT id, file_name, file_size FROM documents WHERE agenda_item_id = ?`
  )
    .bind(id)
    .all<AgendaItemDocument>();

  // §3.4: 賛否結果は「この議題を扱った会議」のうち、実際に賛否が記録された会議のみ表示する
  // (INNER JOIN agenda_item_votes により未記録の会議は結果セットに含まれない)。1クエリで N+1 を避ける。
  const { results: voteRows } = await DB.prepare(
    `SELECT mai.meeting_id, m.date,
            CASE WHEN m.meeting_type = 'committee' THEN COALESCE(c2.name, '委員会') ELSE '本会議' END AS meeting_label,
            v.member_id, mem.name AS member_name, mem.seat_number, v.vote_result
     FROM meeting_agenda_items mai
     JOIN meetings m ON m.id = mai.meeting_id
     LEFT JOIN committees c2 ON c2.id = m.committee_id
     JOIN agenda_item_votes v ON v.meeting_id = mai.meeting_id AND v.agenda_item_id = mai.agenda_item_id
     JOIN members mem ON mem.id = v.member_id
     WHERE mai.agenda_item_id = ?
     ORDER BY m.date ASC, mai.meeting_id ASC, mem.seat_number ASC`
  )
    .bind(id)
    .all<{
      meeting_id: number;
      date: string;
      meeting_label: string;
      member_id: number;
      member_name: string;
      seat_number: number;
      vote_result: string;
    }>();

  const voteResultsByMeeting = new Map<number, VoteMeetingResult>();
  for (const r of voteRows) {
    let entry = voteResultsByMeeting.get(r.meeting_id);
    if (!entry) {
      entry = { meeting_id: r.meeting_id, date: r.date, meeting_label: r.meeting_label, votes: [] };
      voteResultsByMeeting.set(r.meeting_id, entry);
    }
    entry.votes.push({
      member_id: r.member_id,
      member_name: r.member_name,
      seat_number: r.seat_number,
      vote_result: r.vote_result,
    });
  }

  return c.html(
    <Layout title={item.title}>
      <AgendaItemDetailPage item={item} documents={documents} voteResultsByMeeting={[...voteResultsByMeeting.values()]} />
    </Layout>
  );
});
