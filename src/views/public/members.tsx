import type { FC } from "hono/jsx";

export type MemberListItem = {
  id: number;
  name: string;
  seat_number: number;
  election_count: number;
  elected_on: string;
  is_active: number;
  faction_name: string | null;
};

export type TermOption = { elected_on: string };

export const MembersPage: FC<{ items: MemberListItem[]; terms: TermOption[]; selectedTerm: string }> = ({
  items,
  terms,
  selectedTerm,
}) => (
  <section>
    <h1>議員一覧</h1>
    {terms.length > 0 && (
      <form method="get" class="search-form">
        <label>
          期(当選年月日)
          <select name="term">
            {terms.map((t) => (
              <option value={t.elected_on} selected={t.elected_on === selectedTerm}>
                {t.elected_on} 当選
              </option>
            ))}
          </select>
        </label>
        <button type="submit" class="button button--primary">
          表示する
        </button>
      </form>
    )}
    {items.length === 0 ? (
      <p>この期の議員は登録されていません。</p>
    ) : (
      <table class="admin-table">
        <thead>
          <tr>
            <th>議席番号</th>
            <th>氏名</th>
            <th>会派</th>
            <th>当選期</th>
            <th>当選年月日</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr>
              <td>{m.seat_number}</td>
              <td>{m.name}</td>
              <td>{m.faction_name ?? "無所属"}</td>
              <td>{m.election_count}期</td>
              <td>{m.elected_on}</td>
              <td>{m.is_active ? "現任" : "退任"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);
