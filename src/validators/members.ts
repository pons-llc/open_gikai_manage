import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const memberSchema = z.object({
  name: z.string().trim().min(1, "氏名は必須です").max(100),
  election_count: z.number().int().min(1, "当選期は1以上で入力してください"),
  elected_on: z.string().regex(dateRe, "当選年月日は YYYY-MM-DD 形式で入力してください"),
  seat_number: z.number().int().min(1, "議席番号は1以上で入力してください"),
  is_active: z.boolean(),
});

export type MemberInput = z.infer<typeof memberSchema>;
