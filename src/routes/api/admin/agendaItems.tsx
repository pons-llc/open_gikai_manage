import { Hono } from "hono";
import type { AppEnv } from "../../../env";
import { createAgendaItem } from "../../../lib/agendaItems";

export const apiAgendaItemsRoute = new Hono<AppEnv>();

/**
 * P3-4: 日程フォームの議題クイック作成。requireAuth は /api/admin/* に app.use 済み(src/index.tsx)。
 * design.md §5.3 で「実装しない」と明記されている検索 API とは別物(クイック作成専用の新規 API)。
 * 予約公開は行わず即時公開固定とする(UI を単純に保つ方針。予約公開したい場合は議題画面を使う)。
 */
apiAgendaItemsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: { code: "validation_failed", message: "リクエスト形式が不正です" } }, 400);
  }
  const record = body as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const fiscalYear = Number(record.fiscal_year) || 0;
  const number = Number(record.number) || 0;
  const category = typeof record.category === "string" ? record.category : "";
  const agendaTypeId = category === "bill" && record.agenda_type_id ? Number(record.agenda_type_id) || null : null;

  const result = await createAgendaItem(c, {
    title,
    fiscal_year: fiscalYear,
    number,
    category,
    agenda_type_id: agendaTypeId,
    committee_id: null,
    published_at: "",
  });
  if (!result.ok) {
    return c.json({ error: { code: "validation_failed", message: result.errors.join(" / ") } }, 400);
  }
  return c.json(
    { id: result.id, title: result.title, fiscal_year: result.fiscal_year, number: result.number, category: result.category },
    201
  );
});
