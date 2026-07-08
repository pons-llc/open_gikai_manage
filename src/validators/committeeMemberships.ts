import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const committeeMembershipRoles = ["chair", "vice_chair", "member"] as const;

export const committeeMembershipRoleLabels: Record<(typeof committeeMembershipRoles)[number], string> = {
  chair: "委員長",
  vice_chair: "副委員長",
  member: "委員",
};

export const committeeMembershipSchema = z
  .object({
    committee_id: z.number().int().positive("委員会を選択してください"),
    member_id: z.number().int().positive("議員を選択してください"),
    role: z.enum(committeeMembershipRoles, { message: "役職を選択してください" }),
    term_start: z.string().regex(dateRe, "任期開始日は YYYY-MM-DD 形式で入力してください"),
    term_end: z.string().regex(dateRe, "任期終了日は YYYY-MM-DD 形式で入力してください").nullable(),
  })
  .refine((v) => v.term_end === null || v.term_start <= v.term_end, {
    message: "任期終了日は開始日以降にしてください",
    path: ["term_end"],
  });

export type CommitteeMembershipInput = z.infer<typeof committeeMembershipSchema>;

/** §8: 同一議員×同一委員会で任期期間が重複しないこと(アプリ層で判定) */
export const termsOverlap = (
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean => aStart <= (bEnd ?? "9999-12-31") && bStart <= (aEnd ?? "9999-12-31");
