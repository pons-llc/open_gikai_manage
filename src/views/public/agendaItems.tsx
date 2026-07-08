import type { FC } from "hono/jsx";
import { voteResultLabels, voteResults } from "../../validators/votes";

const categoryLabels: Record<string, string> = {
  bill: "議案",
  petition: "請願",
  appeal: "陳情",
  committee: "委員会",
  other: "その他",
};

export type AgendaItemListItem = {
  id: number;
  title: string;
  fiscal_year: number;
  number: number;
  category: string;
};

export const AgendaItemsListPage: FC<{
  items: AgendaItemListItem[];
  years: number[];
  year: string;
  category: string;
  q: string;
}> = ({ items, years, year, category, q }) => (
  <section>
    <h1>議題一覧(議案検索)</h1>
    <form method="get" class="search-form">
      <label>
        キーワード
        <input type="text" name="q" value={q} placeholder="議題名で検索" />
      </label>
      <label>
        年度
        <select name="year">
          <option value="" selected={year === ""}>
            すべて
          </option>
          {years.map((y) => (
            <option value={y} selected={String(y) === year}>
              {y}年度
            </option>
          ))}
        </select>
      </label>
      <label>
        種類
        <select name="category">
          <option value="" selected={category === ""}>
            すべて
          </option>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option value={value} selected={value === category}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" class="button button--primary">
        絞り込む
      </button>
    </form>
    {items.length === 0 ? (
      <p>該当する議題はありません。</p>
    ) : (
      <ul class="list-plain">
        {items.map((a) => (
          <li>
            {a.fiscal_year}年度 {categoryLabels[a.category] ?? a.category} 第{a.number}号{" "}
            <a href={`/agenda-items/${a.id}`}>{a.title}</a>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export type AgendaItemDetail = {
  id: number;
  title: string;
  fiscal_year: number;
  number: number;
  category: string;
  agenda_type_name: string | null;
  committee_name: string | null;
};

export type AgendaItemDocument = { id: number; file_name: string; file_size: number };

export type VoteMeetingResult = {
  meeting_id: number;
  date: string;
  meeting_label: string;
  votes: { member_id: number; member_name: string; seat_number: number; vote_result: string }[];
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const VoteResultBlock: FC<{ result: VoteMeetingResult }> = ({ result }) => {
  const tally = voteResults.reduce<Record<string, number>>((acc, v) => {
    acc[v] = result.votes.filter((r) => r.vote_result === v).length;
    return acc;
  }, {});
  return (
    <section>
      <h3>
        {result.date} {result.meeting_label}
      </h3>
      <p class="hint">{voteResults.map((v) => `${voteResultLabels[v]} ${tally[v]}`).join(" / ")}</p>
      <table class="admin-table">
        <thead>
          <tr>
            <th>議席</th>
            <th>議員名</th>
            <th>賛否</th>
          </tr>
        </thead>
        <tbody>
          {result.votes.map((v) => (
            <tr>
              <td>{v.seat_number}</td>
              <td>{v.member_name}</td>
              <td>{voteResultLabels[v.vote_result as keyof typeof voteResultLabels] ?? v.vote_result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export const AgendaItemDetailPage: FC<{
  item: AgendaItemDetail;
  documents: AgendaItemDocument[];
  voteResultsByMeeting: VoteMeetingResult[];
}> = ({ item, documents, voteResultsByMeeting }) => (
  <section>
    <h1>{item.title}</h1>
    <p class="hint">
      {item.fiscal_year}年度 {categoryLabels[item.category] ?? item.category} 第{item.number}号
      {item.agenda_type_name && ` / ${item.agenda_type_name}`}
      {item.committee_name && ` / ${item.committee_name}`}
    </p>

    <h2>資料</h2>
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

    <h2>賛否結果</h2>
    {voteResultsByMeeting.length === 0 ? (
      <p>まだ賛否が記録された会議はありません。</p>
    ) : (
      voteResultsByMeeting.map((r) => <VoteResultBlock result={r} />)
    )}

    <p>
      <a href="/agenda-items">議題一覧に戻る</a>
    </p>
  </section>
);
