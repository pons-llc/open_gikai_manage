import { z } from "zod";

export const agendaTypeSchema = z.object({
  name: z.string().trim().min(1, "名称は必須です").max(100),
  display_order: z.number().int(),
});

export type AgendaTypeInput = z.infer<typeof agendaTypeSchema>;
