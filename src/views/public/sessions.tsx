import type { FC } from "hono/jsx";

export type SessionListItem = { id: number; name: string; start_date: string; end_date: string };

export const SessionsPage: FC<{ items: SessionListItem[] }> = ({ items }) => (
  <section>
    <h1>定例会一覧</h1>
    {items.length === 0 ? (
      <p>登録された定例会はありません。</p>
    ) : (
      <ul class="list-plain">
        {items.map((s) => (
          <li>
            {s.name} {s.start_date}〜{s.end_date}
          </li>
        ))}
      </ul>
    )}
  </section>
);
