import type { FC } from "hono/jsx";

export type TopMeeting = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
};

export type TopAnnouncement = {
  id: number;
  subject: string;
  published_at: string;
};

export type TopSession = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
};

const meetingLabel = (m: TopMeeting) => (m.meeting_type === "committee" ? m.committee_name ?? "委員会" : "本会議");

const meetingStart = (m: TopMeeting) => (m.start_type === "fixed" ? m.start_time : "前の会議終了後");

export const TopPage: FC<{
  session: TopSession | null;
  meetings: TopMeeting[];
  announcements: TopAnnouncement[];
}> = ({ session, meetings, announcements }) => (
  <>
    {session && (
      <div class="session-banner">
        [開会中] {session.name} {session.start_date}〜{session.end_date}
      </div>
    )}

    <section aria-labelledby="news-heading">
      <h2 id="news-heading">お知らせ</h2>
      {announcements.length === 0 ? (
        <p>現在お知らせはありません。</p>
      ) : (
        <ul class="list-plain">
          {announcements.map((a) => (
            <li>
              <a href={`/news/${a.id}`}>{a.subject}</a>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section aria-labelledby="meetings-heading">
      <h2 id="meetings-heading">今後の日程</h2>
      {meetings.length === 0 ? (
        <p>予定されている日程はありません。</p>
      ) : (
        <ul class="list-plain">
          {meetings.map((m) => (
            <li>
              {m.date} {meetingStart(m)} {meetingLabel(m)}{" "}
              <a href={`/meetings/${m.id}`}>詳細</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  </>
);
