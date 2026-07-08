import { z } from "zod";

export const meetingTypes = ["plenary", "committee"] as const;
export const meetingTypeLabels: Record<(typeof meetingTypes)[number], string> = {
  plenary: "本会議",
  committee: "委員会",
};

export const startTypes = ["fixed", "after_previous"] as const;
export const startTypeLabels: Record<(typeof startTypes)[number], string> = {
  fixed: "時刻指定",
  after_previous: "前の会議終了後",
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;

/**
 * §3.2/§3.3 の CHECK 制約と同じ規則をアプリ層でも担保する:
 * meeting_type='committee' のときのみ committee_id 必須 / start_type='fixed' のときのみ start_time 必須 /
 * start_type='after_previous' のときのみ previous_meeting_id 必須。
 * previous_meeting_id の「同一日のみ・自己参照禁止・循環参照禁止」は DB だけでは表現できないため
 * ルート側で src/lib/meetings.ts の wouldCreateCycle 等を使って追加検証する。
 */
export const meetingSchema = z
  .object({
    meeting_type: z.enum(meetingTypes, { message: "会議種別を選択してください" }),
    committee_id: z.number().int().positive().nullable(),
    regular_session_id: z.number().int().positive().nullable(),
    date: z.string().regex(dateRe, "開催日は YYYY-MM-DD 形式で入力してください"),
    start_type: z.enum(startTypes, { message: "開始方法を選択してください" }),
    start_time: z.string().regex(timeRe, "開始時刻は HH:MM 形式で入力してください").nullable(),
    previous_meeting_id: z.number().int().positive().nullable(),
    schedule_text: z.string(),
  })
  .refine((v) => (v.meeting_type === "committee") === (v.committee_id !== null), {
    message: "会議種別が「委員会」の場合のみ委員会を選択してください",
    path: ["committee_id"],
  })
  .refine((v) => (v.start_type === "fixed") === (v.start_time !== null), {
    message: "開始方法が「時刻指定」の場合は開始時刻が必須です",
    path: ["start_time"],
  })
  .refine((v) => (v.start_type === "after_previous") === (v.previous_meeting_id !== null), {
    message: "開始方法が「前の会議終了後」の場合は対象の会議を選択してください",
    path: ["previous_meeting_id"],
  });

export type MeetingInput = z.infer<typeof meetingSchema>;

/** 一覧の並べ替え。ORDER BY は bind できないため、固定の列挙(ホワイトリスト)からのみ SQL 断片を選ぶ。 */
export const MEETING_SORTS = {
  date_desc: "m.date DESC, m.id DESC",
  date_asc: "m.date ASC, m.id ASC",
} as const;
export type MeetingSort = keyof typeof MEETING_SORTS;
export const isMeetingSort = (v: string): v is MeetingSort => v in MEETING_SORTS;
