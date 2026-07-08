import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const sessionSchema = z
  .object({
    name: z.string().trim().min(1, "名称は必須です").max(200),
    start_date: z.string().regex(dateRe, "開始日は YYYY-MM-DD 形式で入力してください"),
    end_date: z.string().regex(dateRe, "終了日は YYYY-MM-DD 形式で入力してください"),
  })
  .refine((v) => v.start_date <= v.end_date, {
    message: "会期終了日は開始日以降にしてください",
    path: ["end_date"],
  });

export type SessionInput = z.infer<typeof sessionSchema>;
