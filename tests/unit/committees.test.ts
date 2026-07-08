import { describe, expect, it } from "vitest";
import { groupCommitteeRows, type CommitteeMemberRow } from "../../src/views/public/committees";

describe("groupCommitteeRows", () => {
  it("groups multiple member rows under the same committee", () => {
    const rows: CommitteeMemberRow[] = [
      { committee_id: 1, committee_name: "総務常任委員会", category: "standing", role: "chair", member_id: 1, member_name: "山田太郎", seat_number: 1 },
      { committee_id: 1, committee_name: "総務常任委員会", category: "standing", role: "member", member_id: 2, member_name: "鈴木花子", seat_number: 2 },
    ];
    const groups = groupCommitteeRows(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("keeps a committee with no current members as an empty group instead of dropping it", () => {
    const rows: CommitteeMemberRow[] = [
      { committee_id: 1, committee_name: "空の委員会", category: "special", role: null, member_id: null, member_name: null, seat_number: null },
    ];
    const groups = groupCommitteeRows(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(0);
  });

  it("preserves row order across separate committees", () => {
    const rows: CommitteeMemberRow[] = [
      { committee_id: 1, committee_name: "A", category: "standing", role: null, member_id: null, member_name: null, seat_number: null },
      { committee_id: 2, committee_name: "B", category: "standing", role: null, member_id: null, member_name: null, seat_number: null },
    ];
    expect(groupCommitteeRows(rows).map((g) => g.name)).toEqual(["A", "B"]);
  });
});
