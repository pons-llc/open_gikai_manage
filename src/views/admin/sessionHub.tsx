import type { FC } from "hono/jsx";
import { AdminSection, ErrorList } from "./shared";
import type { SessionFormValues, SessionRow } from "./sessions";

export type SessionHubMeetingRow = {
  id: number;
  meeting_type: string;
  committee_name: string | null;
  date: string;
  start_type: string;
  start_time: string | null;
};

const meetingLabel = (r: SessionHubMeetingRow) => (r.meeting_type === "committee" ? (r.committee_name ?? "委員会") : "本会議");
const startLabel = (r: SessionHubMeetingRow) => (r.start_type === "fixed" ? r.start_time : "前の会議終了後");

/** P2-3: 定例会詳細ハブ。会期情報フォーム + この定例会に紐づく日程の一覧。 */
export const SessionHubPage: FC<{
  session: SessionRow;
  form: SessionFormValues;
  errors: string[];
  meetings: SessionHubMeetingRow[];
}> = ({ session, form, errors, meetings }) => (
  <>
    <p>
      <a href="/admin/sessions">定例会一覧に戻る</a>
    </p>

    <AdminSection title={`定例会: ${session.name}`}>
      <ErrorList errors={errors} />
      <form method="post" action={`/admin/sessions/${session.id}`} class="admin-form">
        <div class="field">
          <label for="name">会期名</label>
          <input type="text" id="name" name="name" value={form.name} required />
        </div>
        <div class="field">
          <label for="start_date">開会日</label>
          <input type="date" id="start_date" name="start_date" value={form.start_date} required />
        </div>
        <div class="field">
          <label for="end_date">閉会日</label>
          <input type="date" id="end_date" name="end_date" value={form.end_date} required />
        </div>
        <button type="submit" class="button button--primary">
          更新する
        </button>
      </form>
    </AdminSection>

    <AdminSection title="この定例会の日程">
      <p>
        <a href={`/admin/meetings/new?regular_session_id=${session.id}`} class="button button--primary">
          この定例会に日程を追加
        </a>
      </p>
      {meetings.length === 0 ? (
        <p>この定例会に紐づく日程はありません。</p>
      ) : (
        <table class="admin-table">
          <thead>
            <tr>
              <th>開催日</th>
              <th>開始</th>
              <th>会議</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr>
                <td>{m.date}</td>
                <td>{startLabel(m)}</td>
                <td>{meetingLabel(m)}</td>
                <td class="actions">
                  <a href={`/admin/meetings/${m.id}/edit`}>編集</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminSection>
  </>
);
