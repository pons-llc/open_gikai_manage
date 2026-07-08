import { describe, expect, it } from "vitest";
import { isVoteResult, voteResultLabels, voteResults } from "../../src/validators/votes";

describe("isVoteResult", () => {
  it("accepts every declared vote result value", () => {
    for (const v of voteResults) expect(isVoteResult(v)).toBe(true);
  });

  it("rejects arbitrary strings, including values not covered by the CHECK constraint", () => {
    expect(isVoteResult("")).toBe(false);
    expect(isVoteResult("yes")).toBe(false);
    expect(isVoteResult("FOR")).toBe(false);
  });

  it("has a Japanese label for every vote result", () => {
    for (const v of voteResults) expect(voteResultLabels[v]).toBeTruthy();
  });
});
