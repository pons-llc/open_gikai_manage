import { z } from "zod";
import { termsOverlap } from "./committeeMemberships";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const factionMembershipSchema = z
  .object({
    faction_id: z.number().int().positive("会派を選択してください"),
    member_id: z.number().int().positive("議員を選択してください"),
    term_start: z.string().regex(dateRe, "所属開始日は YYYY-MM-DD 形式で入力してください"),
    term_end: z.string().regex(dateRe, "所属終了日は YYYY-MM-DD 形式で入力してください").nullable(),
  })
  .refine((v) => v.term_end === null || v.term_start <= v.term_end, {
    message: "所属終了日は開始日以降にしてください",
    path: ["term_end"],
  });

export type FactionMembershipInput = z.infer<typeof factionMembershipSchema>;

export { termsOverlap };
