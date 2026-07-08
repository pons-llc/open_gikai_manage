import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { publicCache } from "../../lib/cache";
import { Layout } from "../../views/layout";
import { MembersPage, type MemberListItem, type TermOption } from "../../views/public/members";

export const membersRoute = new Hono<AppEnv>();

/**
 * 「期」を表す専用カラムは無いため、同じ日に当選した議員の集合を1期として elected_on でグルーピングする。
 * is_active を問わず、選んだ期に当選した議員を全員表示する(過去の議員も閲覧できるようにするため)。
 */
membersRoute.get("/", publicCache, async (c) => {
  const { DB } = c.env;
  const { results: terms } = await DB.prepare(
    `SELECT DISTINCT elected_on FROM members ORDER BY elected_on DESC`
  ).all<TermOption>();

  const selectedTerm = c.req.query("term") || terms[0]?.elected_on || "";

  const { results: items } = await DB.prepare(
    `SELECT mem.id, mem.name, mem.seat_number, mem.election_count, mem.elected_on, mem.is_active, f.name AS faction_name
     FROM members mem
     LEFT JOIN faction_memberships fm ON fm.member_id = mem.id AND fm.term_end IS NULL
     LEFT JOIN factions f ON f.id = fm.faction_id
     WHERE mem.elected_on = ?
     ORDER BY mem.seat_number ASC`
  )
    .bind(selectedTerm)
    .all<MemberListItem>();

  return c.html(
    <Layout title="議員一覧">
      <MembersPage items={items} terms={terms} selectedTerm={selectedTerm} />
    </Layout>
  );
});
