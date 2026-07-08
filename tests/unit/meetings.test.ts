import { describe, expect, it } from "vitest";
import { sortMeetingsByChain, type ChainableMeeting } from "../../src/lib/meetings";

const fixed = (id: number, start_time: string): ChainableMeeting => ({
  id,
  start_type: "fixed",
  start_time,
  previous_meeting_id: null,
});

const after = (id: number, previous_meeting_id: number): ChainableMeeting => ({
  id,
  start_type: "after_previous",
  start_time: null,
  previous_meeting_id,
});

describe("sortMeetingsByChain", () => {
  it("orders fixed meetings by start_time", () => {
    const meetings = [fixed(3, "13:00"), fixed(1, "09:30"), fixed(2, "10:00")];
    expect(sortMeetingsByChain(meetings).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("inserts an after_previous meeting immediately after the meeting it follows", () => {
    // 09:30 本会議(1) -> 本会議終了後 総務委員会(2) -> 14:00 文教委員会(3)
    const meetings = [fixed(1, "09:30"), after(2, 1), fixed(3, "14:00")];
    expect(sortMeetingsByChain(meetings).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("expands multi-hop chains (A -> B -> C)", () => {
    const meetings = [fixed(1, "09:30"), after(2, 1), after(3, 2)];
    expect(sortMeetingsByChain(meetings).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("interleaves a chain between two fixed-time backbone meetings", () => {
    const meetings = [fixed(10, "09:00"), fixed(30, "15:00"), after(20, 10)];
    expect(sortMeetingsByChain(meetings).map((m) => m.id)).toEqual([10, 20, 30]);
  });

  it("does not infinite-loop on malformed cyclic input and still returns every meeting once", () => {
    // 保存時のバリデーションで本来弾かれるはずだが、防御的に無限ループしないことを確認する。
    const meetings = [after(1, 2), after(2, 1)];
    const result = sortMeetingsByChain(meetings);
    expect(result.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  it("appends an after_previous meeting whose previous is outside the given set instead of dropping it", () => {
    const meetings = [fixed(1, "09:30"), after(2, 999)];
    const result = sortMeetingsByChain(meetings);
    expect(result.map((m) => m.id).sort()).toEqual([1, 2]);
  });
});
