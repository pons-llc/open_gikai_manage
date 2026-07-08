import { z } from "zod";

export const agendaItemCategories = ["bill", "petition", "appeal", "committee", "other"] as const;

export const agendaItemCategoryLabels: Record<(typeof agendaItemCategories)[number], string> = {
  bill: "議案",
  petition: "請願",
  appeal: "陳情",
  committee: "委員会",
  other: "その他",
};

/**
 * §3.2 補足: 種類=議案のときのみ議案種別必須、種類=委員会のときのみ委員会必須。
 * それ以外の種類では両方 null(DB の CHECK 制約と同じ規則をアプリ層でも担保する)。
 */
export const agendaItemSchema = z
  .object({
    title: z.string().trim().min(1, "議題名は必須です").max(300),
    fiscal_year: z.number().int().min(1900, "年度が不正です").max(2200, "年度が不正です"),
    number: z.number().int().positive("番号は1以上で入力してください"),
    category: z.enum(agendaItemCategories, { message: "種類を選択してください" }),
    agenda_type_id: z.number().int().positive().nullable(),
    committee_id: z.number().int().positive().nullable(),
    // "YYYY-MM-DD HH:MM:SS" 形式(SQLite datetime() と同じ)。空欄なら即時公開(DB側で datetime('now') を使う)。
    published_at: z
      .string()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v), { message: "公開日時が不正です" }),
  })
  .refine((v) => (v.category === "bill") === (v.agenda_type_id !== null), {
    message: "種類が「議案」の場合のみ議案種別を選択してください",
    path: ["agenda_type_id"],
  })
  .refine((v) => (v.category === "committee") === (v.committee_id !== null), {
    message: "種類が「委員会」の場合のみ委員会を選択してください",
    path: ["committee_id"],
  });

export type AgendaItemInput = z.infer<typeof agendaItemSchema>;

/** 一覧の並べ替え。ORDER BY は bind できないため、固定の列挙(ホワイトリスト)からのみ SQL 断片を選ぶ。 */
export const AGENDA_ITEM_SORTS = {
  fiscal_year_desc: "fiscal_year DESC, number DESC",
  fiscal_year_asc: "fiscal_year ASC, number ASC",
  number_desc: "number DESC",
  number_asc: "number ASC",
} as const;
export type AgendaItemSort = keyof typeof AGENDA_ITEM_SORTS;
export const isAgendaItemSort = (v: string): v is AgendaItemSort => v in AGENDA_ITEM_SORTS;
