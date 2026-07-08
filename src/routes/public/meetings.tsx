import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { buildMonthGrid, monthRange, shiftMonth } from "../../lib/calendar";
import { publicCache } from "../../lib/cache";
import { sortMeetingsByChain } from "../../lib/meetings";
import { Layout } from "../../views/layout";
import {
  MeetingDetailPage,
  MeetingsCalendarPage,
  type CalendarMeeting,
  type MeetingAgendaItemRow,
  type MeetingDetail,
  type MeetingDocumentRow,
} from "../../views/public/meetings";

export const meetingsRoute = new Hono<AppEnv>();

const meetingLabelOf = (meetingType: string, committeeName: string | null) =>
  meetingType === "committee" ? (committeeName ?? "委員会") : "本会議";

meetingsRoute.get("/", publicCache, async (c) => {
  const { DB } = c.env;

  const now = new Date();
  const year = Number(c.req.query("year")) || now.getUTCFullYear();
  const month = Number(c.req.query("month")) || now.getUTCMonth() + 1;
  const { from, to } = monthRange(year, month);

  const { results: meetings } = await DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date, m.start_type, m.start_time, m.previous_meeting_id
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date >= ? AND m.date <= ?
     ORDER BY m.date ASC, m.id ASC`
  )
    .bind(from, to)
    .all<CalendarMeeting>();

  const byDate = new Map<string, CalendarMeeting[]>();
  for (const m of meetings) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }
  const meetingsByDate: Record<string, CalendarMeeting[]> = {};
  for (const [date, list] of byDate) meetingsByDate[date] = sortMeetingsByChain(list);

  return c.html(
    <Layout title="日程一覧">
      <MeetingsCalendarPage
        year={year}
        month={month}
        weeks={buildMonthGrid(year, month)}
        meetingsByDate={meetingsByDate}
        prev={shiftMonth(year, month, -1)}
        next={shiftMonth(year, month, 1)}
      />
    </Layout>
  );
});

meetingsRoute.get("/:id", publicCache, async (c) => {
  const id = Number(c.req.param("id"));
  const { DB } = c.env;

  const meetingRow = await DB.prepare(
    `SELECT m.id, m.meeting_type, m.date, m.start_type, m.start_time, m.schedule_text, m.previous_meeting_id,
            c.name AS committee_name, rs.name AS regular_session_name
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     LEFT JOIN regular_sessions rs ON rs.id = m.regular_session_id
     WHERE m.id = ?`
  )
    .bind(id)
    .first<{
      id: number;
      meeting_type: "plenary" | "committee";
      date: string;
      start_type: "fixed" | "after_previous";
      start_time: string | null;
      schedule_text: string;
      previous_meeting_id: number | null;
      committee_name: string | null;
      regular_session_name: string | null;
    }>();
  if (!meetingRow) return c.notFound();

  let previousMeetingLabel: string | null = null;
  if (meetingRow.previous_meeting_id) {
    const prev = await DB.prepare(`SELECT m2.meeting_type, c2.name AS committee_name
       FROM meetings m2 LEFT JOIN committees c2 ON c2.id = m2.committee_id WHERE m2.id = ?`)
      .bind(meetingRow.previous_meeting_id)
      .first<{ meeting_type: string; committee_name: string | null }>();
    if (prev) previousMeetingLabel = meetingLabelOf(prev.meeting_type, prev.committee_name);
  }

  const meeting: MeetingDetail = {
    id: meetingRow.id,
    meeting_type: meetingRow.meeting_type,
    committee_name: meetingRow.committee_name,
    date: meetingRow.date,
    start_type: meetingRow.start_type,
    start_time: meetingRow.start_time,
    schedule_text: meetingRow.schedule_text,
    regular_session_name: meetingRow.regular_session_name,
    previous_meeting_label: previousMeetingLabel,
  };

  // §3.4: 議題一覧は meeting_agenda_items 経由(直接経路)、published_at <= now の議題のみ INNER JOIN で絞る。
  // 資料は同じクエリで LEFT JOIN し、アプリ側で議題ごとにグループ化して N+1 を避ける。
  const { results: agendaRows } = await DB.prepare(
    `SELECT ai.id AS agenda_item_id, ai.title, ai.category, mai.display_order,
            d.id AS document_id, d.file_name, d.file_size
     FROM meeting_agenda_items mai
     JOIN agenda_items ai ON ai.id = mai.agenda_item_id AND ai.published_at <= datetime('now')
     LEFT JOIN documents d ON d.agenda_item_id = ai.id
     WHERE mai.meeting_id = ?
     ORDER BY mai.display_order ASC, ai.id ASC, d.id ASC`
  )
    .bind(id)
    .all<{
      agenda_item_id: number;
      title: string;
      category: string;
      document_id: number | null;
      file_name: string | null;
      file_size: number | null;
    }>();

  const agendaItemsMap = new Map<number, MeetingAgendaItemRow>();
  for (const r of agendaRows) {
    let item = agendaItemsMap.get(r.agenda_item_id);
    if (!item) {
      item = { id: r.agenda_item_id, title: r.title, category: r.category, documents: [] };
      agendaItemsMap.set(r.agenda_item_id, item);
    }
    if (r.document_id !== null && r.file_name !== null && r.file_size !== null) {
      item.documents.push({ id: r.document_id, file_name: r.file_name, file_size: r.file_size });
    }
  }

  const { results: documents } = await DB.prepare(
    `SELECT d.id, d.file_name, d.file_size
     FROM meeting_documents md
     JOIN documents d ON d.id = md.document_id
     WHERE md.meeting_id = ?
     ORDER BY md.display_order ASC`
  )
    .bind(id)
    .all<MeetingDocumentRow>();

  return c.html(
    <Layout title={`${meetingLabelOf(meeting.meeting_type, meeting.committee_name)} ${meeting.date}`}>
      <MeetingDetailPage meeting={meeting} agendaItems={[...agendaItemsMap.values()]} documents={documents} />
    </Layout>
  );
});
