import { describe, expect, it } from "vitest";
import {
  checkCommitteeOverlap,
  checkFactionOverlap,
  endCommitteeMembership,
  endFactionMembership,
} from "../../src/lib/memberships";
import type { Context } from "hono";
import type { AppEnv } from "../../src/env";

/**
 * P2 §4 完了条件: membership 共用ロジック(lib/memberships.ts)のユニットテスト。
 * 実際の D1 は使わず、`.prepare().bind().all()/.run()` だけを実装した最小限のフェイクで検証する。
 */
type FakeRow = Record<string, unknown>;

const fakeDb = (rows: FakeRow[], changes = 0) => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, args });
        return {
          all: async () => ({ results: rows }),
          run: async () => ({ meta: { changes, last_row_id: 1 } }),
        };
      },
    }),
  };
  return { db: db as unknown as D1Database, calls };
};

const fakeContext = (db: D1Database): Context<AppEnv> =>
  ({ env: { DB: db }, get: () => undefined }) as unknown as Context<AppEnv>;

describe("checkFactionOverlap", () => {
  it("returns true when an existing membership overlaps the given range", async () => {
    const { db } = fakeDb([{ term_start: "2023-04-01", term_end: null }]);
    expect(await checkFactionOverlap(db, 1, "2024-01-01", null, null)).toBe(true);
  });

  it("returns false when no existing membership overlaps", async () => {
    const { db } = fakeDb([{ term_start: "2020-01-01", term_end: "2020-12-31" }]);
    expect(await checkFactionOverlap(db, 1, "2024-01-01", null, null)).toBe(false);
  });

  it("excludes the row being edited via bound editingId", async () => {
    const { db, calls } = fakeDb([]);
    await checkFactionOverlap(db, 1, "2024-01-01", null, 42);
    expect(calls[0].args).toEqual([1, 42]);
  });
});

describe("checkCommitteeOverlap", () => {
  it("returns true when the same member already sits on the committee during that period", async () => {
    const { db } = fakeDb([{ term_start: "2024-05-01", term_end: null }]);
    expect(await checkCommitteeOverlap(db, 1, 2, "2024-06-01", null, null)).toBe(true);
  });

  it("returns false for disjoint terms", async () => {
    const { db } = fakeDb([{ term_start: "2020-01-01", term_end: "2020-12-31" }]);
    expect(await checkCommitteeOverlap(db, 1, 2, "2024-06-01", null, null)).toBe(false);
  });
});

describe("endFactionMembership", () => {
  it("returns true and logs when a row is updated", async () => {
    const { db } = fakeDb([], 1);
    expect(await endFactionMembership(fakeContext(db), 10, 5)).toBe(true);
  });

  it("returns false when no row matches (already ended, or wrong member)", async () => {
    const { db } = fakeDb([], 0);
    expect(await endFactionMembership(fakeContext(db), 10, 5)).toBe(false);
  });
});

describe("endCommitteeMembership", () => {
  it("scopes by memberId when provided (member hub)", async () => {
    const { db, calls } = fakeDb([], 1);
    expect(await endCommitteeMembership(fakeContext(db), 10, { memberId: 5 })).toBe(true);
    expect(calls[0].sql).toContain("member_id = ?");
    expect(calls[0].sql).not.toContain("committee_id = ?");
  });

  it("scopes by committeeId when provided (committee hub)", async () => {
    const { db, calls } = fakeDb([], 1);
    expect(await endCommitteeMembership(fakeContext(db), 10, { committeeId: 3 })).toBe(true);
    expect(calls[0].sql).toContain("committee_id = ?");
    expect(calls[0].sql).not.toContain("member_id = ?");
  });

  it("returns false when no row matches", async () => {
    const { db } = fakeDb([], 0);
    expect(await endCommitteeMembership(fakeContext(db), 10, { memberId: 5 })).toBe(false);
  });
});
