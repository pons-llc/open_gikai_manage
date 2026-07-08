import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str } from "../../lib/forms";
import { isVoteResult } from "../../validators/votes";
import { Layout } from "../../views/layout";
import {
  VoteGridPage,
  VotesListPage,
  type VoteGridAgendaItem,
  type VoteGridMember,
  type VoteMeetingRow,
} from "../../views/admin/votes";

export const votesRoute = new Hono<AppEnv>();

const listVoteMeetings = (DB: D1Database) =>
  DB.prepare(
    `SELECT m.id, m.date,
            CASE WHEN m.meeting_type = 'committee' THEN COALESCE(c.name, '委員会') ELSE '本会議' END AS meeting_label,
            COUNT(DISTINCT mai.agenda_item_id) AS agenda_item_count
     FROM meetings m
     JOIN meeting_agenda_items mai ON mai.meeting_id = m.id
     LEFT JOIN committees c ON c.id = m.committee_id
     GROUP BY m.id
     ORDER BY m.date DESC, m.id DESC`
  )
    .all<VoteMeetingRow>()
    .then((r) => r.results);

const loadMeeting = (DB: D1Database, meetingId: number) =>
  DB.prepare(
    `SELECT m.date, CASE WHEN m.meeting_type = 'committee' THEN COALESCE(c.name, '委員会') ELSE '本会議' END AS meeting_label
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.id = ?`
  )
    .bind(meetingId)
    .first<{ date: string; meeting_label: string }>();

const listAgendaItemsForMeeting = (DB: D1Database, meetingId: number) =>
  DB.prepare(
    `SELECT ai.id, ai.title
     FROM meeting_agenda_items mai
     JOIN agenda_items ai ON ai.id = mai.agenda_item_id
     WHERE mai.meeting_id = ?
     ORDER BY mai.display_order ASC, mai.agenda_item_id ASC`
  )
    .bind(meetingId)
    .all<VoteGridAgendaItem>()
    .then((r) => r.results);

/** §3.4 と同じ原則: is_active=0 の議員でも、この会議で既に賛否記録があれば表示し続ける(履歴を消さない)。 */
const listMembersForMeeting = (DB: D1Database, meetingId: number) =>
  DB.prepare(
    `SELECT DISTINCT mem.id, mem.name, mem.seat_number
     FROM members mem
     WHERE mem.is_active = 1 OR mem.id IN (SELECT member_id FROM agenda_item_votes WHERE meeting_id = ?)
     ORDER BY mem.seat_number ASC`
  )
    .bind(meetingId)
    .all<VoteGridMember>()
    .then((r) => r.results);

const listExistingCells = (DB: D1Database, meetingId: number) =>
  DB.prepare(`SELECT agenda_item_id, member_id, vote_result FROM agenda_item_votes WHERE meeting_id = ?`)
    .bind(meetingId)
    .all<{ agenda_item_id: number; member_id: number; vote_result: string }>()
    .then((r) => r.results);

votesRoute.get("/", async (c) => {
  const rows = await listVoteMeetings(c.env.DB);
  return c.html(
    <Layout title="賛否記録" variant="admin" adminEmail={c.get("adminEmail")}>
      <VotesListPage rows={rows} />
    </Layout>
  );
});

votesRoute.get("/:meetingId", async (c) => {
  const meetingId = Number(c.req.param("meetingId"));
  const meeting = await loadMeeting(c.env.DB, meetingId);
  if (!meeting) return c.notFound();

  const [agendaItems, members, existingCells] = await Promise.all([
    listAgendaItemsForMeeting(c.env.DB, meetingId),
    listMembersForMeeting(c.env.DB, meetingId),
    listExistingCells(c.env.DB, meetingId),
  ]);
  const cells: Record<string, string> = {};
  for (const v of existingCells) cells[`${v.agenda_item_id}_${v.member_id}`] = v.vote_result;

  return c.html(
    <Layout title="賛否記録" variant="admin" adminEmail={c.get("adminEmail")}>
      <VoteGridPage
        date={meeting.date}
        meetingLabel={meeting.meeting_label}
        agendaItems={agendaItems}
        members={members}
        cells={cells}
        errors={[]}
      />
    </Layout>
  );
});

votesRoute.post("/:meetingId", async (c) => {
  const meetingId = Number(c.req.param("meetingId"));
  const meeting = await loadMeeting(c.env.DB, meetingId);
  if (!meeting) return c.notFound();

  const [agendaItems, members, existingCells] = await Promise.all([
    listAgendaItemsForMeeting(c.env.DB, meetingId),
    listMembersForMeeting(c.env.DB, meetingId),
    listExistingCells(c.env.DB, meetingId),
  ]);
  const existing = new Set(existingCells.map((v) => `${v.agenda_item_id}_${v.member_id}`));

  const form = await c.req.parseBody();
  const statements = [];
  for (const a of agendaItems) {
    for (const m of members) {
      const key = `${a.id}_${m.id}`;
      const raw = str(form, `vote_${key}`);
      if (raw === "") {
        if (existing.has(key)) {
          statements.push(
            c.env.DB.prepare(
              `DELETE FROM agenda_item_votes WHERE meeting_id = ? AND agenda_item_id = ? AND member_id = ?`
            ).bind(meetingId, a.id, m.id)
          );
        }
        continue;
      }
      if (!isVoteResult(raw)) continue; // select 由来のため通常起きないが、不正値は無視する
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO agenda_item_votes (meeting_id, agenda_item_id, member_id, vote_result)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (meeting_id, agenda_item_id, member_id)
           DO UPDATE SET vote_result = excluded.vote_result, updated_at = datetime('now')`
        ).bind(meetingId, a.id, m.id, raw)
      );
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
    // グリッド一括保存のため、セル単位ではなく会議単位で1件だけ記録する。
    logAdminMutation(c, "agenda_item_votes", meetingId, "update");
  }
  return c.redirect(`/admin/votes/${meetingId}`);
});
