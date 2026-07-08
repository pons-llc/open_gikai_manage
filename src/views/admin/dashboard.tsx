import type { FC } from "hono/jsx";

export type UpcomingMeeting = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
};

export type UnrecordedVoteMeeting = {
  id: number;
  meeting_type: "plenary" | "committee";
  committee_name: string | null;
  date: string;
};

export type ReservedItem = {
  id: number;
  label: string;
  published_at: string;
  kind: "agenda_item" | "announcement";
};

const meetingLabel = (m: { meeting_type: string; committee_name: string | null }) =>
  m.meeting_type === "committee" ? (m.committee_name ?? "委員会") : "本会議";
const meetingStart = (m: UpcomingMeeting) => (m.start_type === "fixed" ? m.start_time : "前の会議終了後");

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const reservedItemHref = (item: ReservedItem) =>
  item.kind === "agenda_item" ? `/admin/agenda-items/${item.id}/edit` : `/admin/announcements/${item.id}/edit`;
const reservedItemKindLabel = (item: ReservedItem) => (item.kind === "agenda_item" ? "議題" : "お知らせ");

export const DashboardPage: FC<{
  upcomingMeetings: UpcomingMeeting[];
  unrecordedVoteMeetings: UnrecordedVoteMeeting[];
  reservedItems: ReservedItem[];
  usedBytes: number;
  quotaBytes: number;
}> = ({ upcomingMeetings, unrecordedVoteMeetings, reservedItems, usedBytes, quotaBytes }) => {
  const usedRatio = quotaBytes > 0 ? usedBytes / quotaBytes : 0;
  return (
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
        <h2>賛否が未記録の終了済み会議</h2>
        {unrecordedVoteMeetings.length === 0 ? (
          <p>未記録の会議はありません。</p>
        ) : (
          <ul class="list-plain">
            {unrecordedVoteMeetings.map((m) => (
              <li>
                {m.date} {meetingLabel(m)} <a href={`/admin/votes/${m.id}`}>賛否を記録する</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>予約中の議題・お知らせ</h2>
        {reservedItems.length === 0 ? (
          <p>予約公開中の項目はありません。</p>
        ) : (
          <ul class="list-plain">
            {reservedItems.map((item) => (
              <li>
                {item.published_at} 公開予定 [{reservedItemKindLabel(item)}] {item.label}{" "}
                <a href={reservedItemHref(item)}>編集</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>ストレージ使用量</h2>
        <p class={usedRatio > 0.9 ? "hint storage-usage storage-usage--warning" : "hint storage-usage"}>
          使用量: {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}({(usedRatio * 100).toFixed(1)}%)
        </p>
      </section>
    </>
  );
};
