import type { FC } from "hono/jsx";

export type DashboardCounts = {
  committees: number;
  sessions: number;
  members: number;
  factions: number;
  announcements: number;
  agendaItems: number;
  documents: number;
  meetings: number;
};

export type UpcomingMeeting = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
};

const CARDS: { key: keyof DashboardCounts; label: string; href: string }[] = [
  { key: "meetings", label: "日程", href: "/admin/meetings" },
  { key: "committees", label: "委員会", href: "/admin/committees" },
  { key: "sessions", label: "定例会", href: "/admin/sessions" },
  { key: "members", label: "議員", href: "/admin/members" },
  { key: "factions", label: "会派", href: "/admin/factions" },
  { key: "announcements", label: "お知らせ", href: "/admin/announcements" },
  { key: "agendaItems", label: "議題", href: "/admin/agenda-items" },
  { key: "documents", label: "資料", href: "/admin/documents" },
];

const meetingLabel = (m: UpcomingMeeting) => (m.meeting_type === "committee" ? (m.committee_name ?? "委員会") : "本会議");
const meetingStart = (m: UpcomingMeeting) => (m.start_type === "fixed" ? m.start_time : "前の会議終了後");

export const DashboardPage: FC<{ counts: DashboardCounts; upcomingMeetings: UpcomingMeeting[] }> = ({
  counts,
  upcomingMeetings,
}) => (
  <>
    <section>
      <h2>直近の日程</h2>
      {upcomingMeetings.length === 0 ? (
        <p>本日以降の日程はありません。</p>
      ) : (
        <ul class="list-plain">
          {upcomingMeetings.map((m) => (
            <li>
              {m.date} {meetingStart(m)} {meetingLabel(m)} <a href={`/admin/meetings/${m.id}/edit`}>編集</a>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section>
      <h2>ダッシュボード</h2>
      <table class="admin-table">
        <thead>
          <tr>
            <th>マスタ</th>
            <th>登録件数</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {CARDS.map((card) => (
            <tr>
              <td>{card.label}</td>
              <td>{counts[card.key]}</td>
              <td class="actions">
                <a href={card.href}>管理画面へ</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>
);
