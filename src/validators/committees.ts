import { z } from "zod";

export const committeeCategories = ["standing", "special", "steering", "other"] as const;

export const committeeCategoryLabels: Record<(typeof committeeCategories)[number], string> = {
  standing: "常任",
  special: "特別",
  steering: "議会運営",
  other: "その他",
};

export const committeeSchema = z.object({
  name: z.string().trim().min(1, "名称は必須です").max(200),
  category: z.enum(committeeCategories, { message: "種別を選択してください" }),
  display_order: z.number().int(),
  is_active: z.boolean(),
});

export type CommitteeInput = z.infer<typeof committeeSchema>;
