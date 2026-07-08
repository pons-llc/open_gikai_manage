import type { FC } from "hono/jsx";
import type { CalendarDay } from "../../lib/calendar";

export type CalendarMeeting = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
  previous_meeting_id: number | null;
};

const meetingLabel = (m: CalendarMeeting) => (m.meeting_type === "committee" ? (m.committee_name ?? "委員会") : "本会議");

const MeetingChip: FC<{ m: CalendarMeeting }> = ({ m }) => (
  <a href={`/meetings/${m.id}`} class="calendar-chip">
    {m.start_type === "fixed" ? m.start_time : "終了後"} {meetingLabel(m)}
  </a>
);

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const MeetingsCalendarPage: FC<{
  year: number;
  month: number;
  weeks: CalendarDay[][];
  meetingsByDate: Record<string, CalendarMeeting[]>;
  prev: { year: number; month: number };
  next: { year: number; month: number };
}> = ({ year, month, weeks, meetingsByDate, prev, next }) => (
  <section>
    <h1>日程一覧</h1>
    <nav aria-label="月の移動" class="calendar-nav">
      <a href={`/meetings?year=${prev.year}&month=${prev.month}`}>← 前月</a>
      <span>
        {year}年{month}月
      </span>
      <a href={`/meetings?year=${next.year}&month=${next.month}`}>次月 →</a>
    </nav>
    <table class="calendar">
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((w) => (
            <th>{w}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr>
            {week.map((day) => (
              <td class={day.inMonth ? "calendar__day" : "calendar__day calendar__day--outside"}>
                <p class="calendar__date">{Number(day.date.slice(8, 10))}</p>
                {(meetingsByDate[day.date] ?? []).map((m) => (
                  <MeetingChip m={m} />
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

export type MeetingDetail = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
  schedule_text: string;
  regular_session_name: string | null;
  previous_meeting_label: string | null;
};

export type MeetingAgendaItemRow = {
  id: number;
  title: string;
  category: string;
  documents: { id: number; file_name: string; file_size: number }[];
};

export type MeetingDocumentRow = { id: number; file_name: string; file_size: number };

const categoryLabels: Record<string, string> = {
  bill: "議案",
  petition: "請願",
  appeal: "陳情",
  committee: "委員会",
  other: "その他",
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MeetingDetailPage: FC<{
  meeting: MeetingDetail;
  agendaItems: MeetingAgendaItemRow[];
  documents: MeetingDocumentRow[];
}> = ({ meeting, agendaItems, documents }) => (
  <section>
    <h1>
      {meeting.meeting_type === "committee" ? (meeting.committee_name ?? "委員会") : "本会議"}
    </h1>
    <p class="hint">
      {meeting.date}{" "}
      {meeting.start_type === "fixed" ? `${meeting.start_time}〜` : `${meeting.previous_meeting_label ?? "前の会議"}終了後`}
      {meeting.regular_session_name && ` / ${meeting.regular_session_name}`}
    </p>
    <p class="preserve-lines">{meeting.schedule_text}</p>

    <h2>この会議の議題</h2>
    {agendaItems.length === 0 ? (
      <p>この会議に紐づく議題はありません。</p>
    ) : (
      <ul class="list-plain">
        {agendaItems.map((a) => (
          <li>
            <a href={`/agenda-items/${a.id}`}>
              {categoryLabels[a.category] ?? a.category} {a.title}
            </a>
            {a.documents.length > 0 && (
              <ul class="list-plain list-plain--nested">
                {a.documents.map((d) => (
                  <li>
                    <a href={`/documents/${d.id}/file`}>
                      {d.file_name}({formatBytes(d.file_size)})
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    )}

    <h2>会議資料(次第・会議録など)</h2>
    {documents.length === 0 ? (
      <p>登録された資料はありません。</p>
    ) : (
      <ul class="list-plain">
        {documents.map((d) => (
          <li>
            <a href={`/documents/${d.id}/file`}>
              {d.file_name}({formatBytes(d.file_size)})
            </a>
          </li>
        ))}
      </ul>
    )}
  </section>
);
