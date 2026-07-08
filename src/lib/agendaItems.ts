import type { Context } from "hono";
import type { AppEnv } from "../env";
import { logAdminMutation } from "./auditLog";
import { agendaItemSchema } from "../validators/agendaItems";

export type AgendaItemCreateResult =
  | { ok: true; id: number; title: string; fiscal_year: number; number: number; category: string }
  | { ok: false; errors: string[] };

/**
 * P3-4: SSR フォーム(agendaItemsRoute)と JSON API(apiAgendaItemsRoute、日程フォームのクイック作成用)の
 * 双方から呼ばれる。INSERT ロジック・重複エラー処理・logAdminMutation を二重実装しない(§7)。
 */
export const createAgendaItem = async (
  c: Context<AppEnv>,
  input: {
    title: string;
    fiscal_year: number;
    number: number;
    category: string;
    agenda_type_id: number | null;
    committee_id: number | null;
    published_at: string;
  }
): Promise<AgendaItemCreateResult> => {
  const parsed = agendaItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO agenda_items (title, fiscal_year, number, category, agenda_type_id, committee_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')))`
    )
      .bind(
        parsed.data.title,
        parsed.data.fiscal_year,
        parsed.data.number,
        parsed.data.category,
        parsed.data.agenda_type_id,
        parsed.data.committee_id,
        parsed.data.published_at
      )
      .run();
    logAdminMutation(c, "agenda_items", result.meta.last_row_id ?? null, "create");
    return {
      ok: true,
      id: result.meta.last_row_id as number,
      title: parsed.data.title,
      fiscal_year: parsed.data.fiscal_year,
      number: parsed.data.number,
      category: parsed.data.category,
    };
  } catch {
    return { ok: false, errors: ["この年度・種類の番号は既に使用されています"] };
  }
};
