import { describe, expect, it } from "vitest";
import { createAgendaItem } from "../../src/lib/agendaItems";
import type { Context } from "hono";
import type { AppEnv } from "../../src/env";

/**
 * P3-4 §4 完了条件: クイック作成 API が通す agendaItemSchema のバリデーションを最優先でカバーする。
 * 実際の D1 は使わず `.prepare().bind().run()` だけを実装した最小限のフェイクで検証する。
 */
const fakeContext = (lastRowId = 1): Context<AppEnv> => {
  const db = {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes: 1, last_row_id: lastRowId } }),
      }),
    }),
  };
  return { env: { DB: db as unknown as D1Database }, get: () => undefined } as unknown as Context<AppEnv>;
};

describe("createAgendaItem", () => {
  it("succeeds for a valid bill with an agenda_type_id", async () => {
    const result = await createAgendaItem(fakeContext(7), {
      title: "令和8年度予算案",
      fiscal_year: 2026,
      number: 1,
      category: "bill",
      agenda_type_id: 3,
      committee_id: null,
      published_at: "",
    });
    expect(result).toEqual({ ok: true, id: 7, title: "令和8年度予算案", fiscal_year: 2026, number: 1, category: "bill" });
  });

  it("rejects an empty title", async () => {
    const result = await createAgendaItem(fakeContext(), {
      title: "",
      fiscal_year: 2026,
      number: 1,
      category: "bill",
      agenda_type_id: 3,
      committee_id: null,
      published_at: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects category=bill without an agenda_type_id (quick-create only exposes it for bills)", async () => {
    const result = await createAgendaItem(fakeContext(), {
      title: "陳情第1号",
      fiscal_year: 2026,
      number: 1,
      category: "bill",
      agenda_type_id: null,
      committee_id: null,
      published_at: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects category=committee without a committee_id (quick-create UI doesn't expose that field)", async () => {
    const result = await createAgendaItem(fakeContext(), {
      title: "委員会報告",
      fiscal_year: 2026,
      number: 1,
      category: "committee",
      agenda_type_id: null,
      committee_id: null,
      published_at: "",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts petition/appeal/other categories with no agenda_type_id or committee_id", async () => {
    const result = await createAgendaItem(fakeContext(9), {
      title: "陳情第1号",
      fiscal_year: 2026,
      number: 1,
      category: "petition",
      agenda_type_id: null,
      committee_id: null,
      published_at: "",
    });
    expect(result).toEqual({ ok: true, id: 9, title: "陳情第1号", fiscal_year: 2026, number: 1, category: "petition" });
  });
});
