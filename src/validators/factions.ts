import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const factionSchema = z.object({
  name: z.string().trim().min(1, "会派名は必須です").max(100),
  established_on: z.string().regex(dateRe, "設置年月日は YYYY-MM-DD 形式で入力してください"),
  is_active: z.boolean(),
});

export type FactionInput = z.infer<typeof factionSchema>;
