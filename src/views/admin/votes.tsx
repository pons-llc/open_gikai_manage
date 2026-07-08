import type { FC } from "hono/jsx";
import { voteResultLabels, voteResults } from "../../validators/votes";
import { AdminSection, ErrorList } from "./shared";

export type VoteMeetingRow = {
  id: number;
  date: string;
  meeting_label: string;
  agenda_item_count: number;
};

export type VoteGridAgendaItem = { id: number; title: string };
export type VoteGridMember = { id: number; name: string; seat_number: number };

export const VotesListPage: FC<{ rows: VoteMeetingRow[] }> = ({ rows }) => (
  <AdminSection
    title="賛否記録"
    description="日程管理で議題を紐付けた会議ごとに、議題×議員のマス目で賛否をまとめて記録します。"
  >
    {rows.length === 0 ? (
      <p>
        記録対象がありません。先に<a href="/admin/meetings">日程管理</a>で会議に議題を紐付けてください。
      </p>
    ) : (
      <table class="admin-table">
        <thead>
          <tr>
            <th>開催日</th>
            <th>会議</th>
            <th>議題数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr>
              <td>{r.date}</td>
              <td>{r.meeting_label}</td>
              <td>{r.agenda_item_count}件</td>
              <td class="actions">
                <a href={`/admin/votes/${r.id}`}>記録/編集</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </AdminSection>
);

/** cellKey は `${agendaItemId}_${memberId}` 形式。値は vote_result またはキー不在=未記録。 */
export const VoteGridPage: FC<{
  date: string;
  meetingLabel: string;
  agendaItems: VoteGridAgendaItem[];
  members: VoteGridMember[];
  cells: Record<string, string>;
  errors: string[];
}> = ({ date, meetingLabel, agendaItems, members, cells, errors }) => (
  <AdminSection title="賛否記録(一括入力)" description={`${date} ${meetingLabel}`}>
    <ErrorList errors={errors} />
    {agendaItems.length === 0 ? (
      <p>この会議に紐づく議題がありません。</p>
    ) : members.length === 0 ? (
      <p>議員が登録されていません。</p>
    ) : (
      <form method="post" data-vote-grid-form>
        <div class="vote-grid-scroll">
          <table class="admin-table vote-grid">
            <thead>
              <tr>
                <th class="vote-grid__corner">議題 \ 議員</th>
                {members.map((m) => (
                  <th>
                    {m.seat_number} {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agendaItems.map((a) => (
                <tr>
                  <th class="vote-grid__row-header">
                    {a.title}
                    <div class="vote-grid__row-fill" data-vote-row-fill>
                      {voteResults.map((v) => (
                        <button type="button" data-vote-fill={v}>
                          全員{voteResultLabels[v]}
                        </button>
                      ))}
                    </div>
                  </th>
                  {members.map((m) => {
                    const key = `${a.id}_${m.id}`;
                    const current = cells[key] ?? "";
                    return (
                      <td>
                        <select name={`vote_${key}`} data-vote-cell>
                          <option value="" selected={current === ""}>
                            未記録
                          </option>
                          {voteResults.map((v) => (
                            <option value={v} selected={current === v}>
                              {voteResultLabels[v]}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" class="button button--primary" style="margin-top: 1rem;">
          記録を保存する
        </button>
        <a href="/admin/votes" style="margin-left: 1rem;">
          一覧へ戻る
        </a>
      </form>
    )}
  </AdminSection>
);
