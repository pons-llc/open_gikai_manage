import { describe, expect, it } from "vitest";
import { buildMonthGrid, monthRange, shiftMonth } from "../../src/lib/calendar";

describe("buildMonthGrid", () => {
  it("produces full weeks (multiples of 7) that include every day of the month", () => {
    const weeks = buildMonthGrid(2026, 7);
    const allDates = weeks.flat();
    expect(allDates.length % 7).toBe(0);
    const inMonthDates = allDates.filter((d) => d.inMonth).map((d) => d.date);
    expect(inMonthDates[0]).toBe("2026-07-01");
    expect(inMonthDates[inMonthDates.length - 1]).toBe("2026-07-31");
    expect(inMonthDates).toHaveLength(31);
  });

  it("pads leading/trailing days from adjacent months without gaps", () => {
    const weeks = buildMonthGrid(2026, 7);
    const allDates = weeks.flat().map((d) => d.date);
    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(allDates[i - 1]);
      const curr = new Date(allDates[i]);
      expect((curr.getTime() - prev.getTime()) / 86_400_000).toBe(1);
    }
  });

  it("handles February in a leap year", () => {
    const weeks = buildMonthGrid(2028, 2);
    const inMonthDates = weeks.flat().filter((d) => d.inMonth);
    expect(inMonthDates).toHaveLength(29);
  });
});

describe("monthRange", () => {
  it("returns the first and last day of the month", () => {
    expect(monthRange(2026, 7)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("shiftMonth", () => {
  it("moves forward within the same year", () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });

  it("rolls over to the next year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls back to the previous year", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});
