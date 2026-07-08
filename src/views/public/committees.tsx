import type { FC } from "hono/jsx";

export type CommitteeMemberRow = {
  committee_id: number;
  committee_name: string;
  category: string;
  role: string | null;
  member_id: number | null;
  member_name: string | null;
  seat_number: number | null;
};

export type CommitteeGroup = {
  id: number;
  name: string;
  category: string;
  members: { id: number; name: string; seat_number: number; role: string }[];
};

const categoryLabels: Record<string, string> = {
  standing: "常任",
  special: "特別",
  steering: "議会運営",
  other: "その他",
};

const roleLabels: Record<string, string> = {
  chair: "委員長",
  vice_chair: "副委員長",
  member: "委員",
};

export const groupCommitteeRows = (rows: CommitteeMemberRow[]): CommitteeGroup[] => {
  const groups = new Map<number, CommitteeGroup>();
  for (const r of rows) {
    let group = groups.get(r.committee_id);
    if (!group) {
      group = { id: r.committee_id, name: r.committee_name, category: r.category, members: [] };
      groups.set(r.committee_id, group);
    }
    if (r.member_id !== null && r.member_name !== null && r.seat_number !== null) {
      group.members.push({ id: r.member_id, name: r.member_name, seat_number: r.seat_number, role: r.role ?? "member" });
    }
  }
  return [...groups.values()];
};

export const CommitteesPage: FC<{ groups: CommitteeGroup[] }> = ({ groups }) => (
  <section>
    <h1>委員会一覧</h1>
    {groups.length === 0 ? (
      <p>登録された委員会はありません。</p>
    ) : (
      groups.map((g) => (
        <section>
          <h2>
            {g.name}(<span>{categoryLabels[g.category] ?? g.category}</span>)
          </h2>
          {g.members.length === 0 ? (
            <p>現在所属する議員はいません。</p>
          ) : (
            <ul class="list-plain">
              {g.members.map((m) => (
                <li>
                  {roleLabels[m.role] ?? m.role} {m.seat_number} {m.name}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))
    )}
  </section>
);
