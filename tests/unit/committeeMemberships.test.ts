import { describe, expect, it } from "vitest";
import { termsOverlap } from "../../src/validators/committeeMemberships";

describe("termsOverlap", () => {
  it("detects overlap when both ranges are ongoing", () => {
    expect(termsOverlap("2023-04-01", null, "2024-01-01", null)).toBe(true);
  });

  it("detects overlap when a closed range falls inside an ongoing one", () => {
    expect(termsOverlap("2023-04-01", null, "2024-01-01", "2024-06-01")).toBe(true);
  });

  it("does not flag adjacent, non-overlapping closed ranges", () => {
    expect(termsOverlap("2023-04-01", "2023-12-31", "2024-01-01", "2024-06-01")).toBe(false);
  });

  it("does not flag disjoint closed ranges", () => {
    expect(termsOverlap("2020-01-01", "2020-12-31", "2023-01-01", "2023-12-31")).toBe(false);
  });

  it("detects overlap on the boundary date", () => {
    expect(termsOverlap("2023-01-01", "2023-06-30", "2023-06-30", "2023-12-31")).toBe(true);
  });
});
