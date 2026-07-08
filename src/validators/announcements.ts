import { z } from "zod";

export const announcementSchema = z.object({
  subject: z.string().trim().min(1, "件名は必須です").max(200),
  body: z.string().trim().min(1, "詳細は必須です"),
  related_url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\//i.test(v), {
      message: "関連URLは http:// または https:// で始まる URL のみ指定できます",
    })
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  // "YYYY-MM-DD HH:MM:SS" 形式(SQLite datetime() と同じ)。§3.4: 空欄なら即時公開(DB側で datetime('now') を使う)。
  published_at: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v), { message: "投稿日時が不正です" }),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

/** <input type="datetime-local"> の "YYYY-MM-DDTHH:MM" ⇔ DB 保存形式の相互変換 */
export const datetimeLocalToDb = (v: string): string => (v === "" ? "" : `${v.replace("T", " ")}:00`);
export const dbToDatetimeLocal = (v: string): string => v.slice(0, 16).replace(" ", "T");
