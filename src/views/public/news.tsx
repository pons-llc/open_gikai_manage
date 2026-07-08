import type { FC } from "hono/jsx";

export type NewsListItem = { id: number; subject: string; published_at: string };
export type NewsDetail = {
  id: number;
  subject: string;
  body: string;
  related_url: string | null;
  published_at: string;
};

export const NewsListPage: FC<{ items: NewsListItem[] }> = ({ items }) => (
  <section>
    <h1>お知らせ</h1>
    {items.length === 0 ? (
      <p>お知らせはありません。</p>
    ) : (
      <ul class="list-plain">
        {items.map((item) => (
          <li>
            <span class="list-plain__date">{item.published_at.slice(0, 10)}</span>{" "}
            <a href={`/news/${item.id}`}>{item.subject}</a>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const NewsDetailPage: FC<{ item: NewsDetail }> = ({ item }) => (
  <section>
    <h1>{item.subject}</h1>
    <p class="hint">{item.published_at}</p>
    {/* 改行保持は raw()/innerHTML ではなく、エスケープ済みテキストに pre-wrap を適用して行う(design.md §10)。 */}
    <p class="preserve-lines">{item.body}</p>
    {item.related_url && (
      <p>
        <a href={item.related_url}>関連リンク</a>
      </p>
    )}
    <p>
      <a href="/news">お知らせ一覧に戻る</a>
    </p>
  </section>
);
