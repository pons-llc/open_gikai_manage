import { Hono } from "hono";
import type { AppEnv } from "../../../env";

export const apiMeetingsRoute = new Hono<AppEnv>();

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/**
 * §6.3: 日程編集画面で開始方法「前の会議終了後」を選んだ際、同日の他会議セレクトへ
 * 切り替えるための fetch 取得用エンドポイント(design.md 「同日会議は fetch で取得」)。
 */
apiMeetingsRoute.get("/", async (c) => {
  const date = c.req.query("date");
  const excludeId = Number(c.req.query("exclude") ?? "0");
  if (!date || !dateRe.test(date)) {
    return c.json({ error: { code: "validation_failed", message: "date クエリが不正です" } }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.meeting_type, m.start_type, m.start_time, c.name AS committee_name
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date = ? AND m.id != ?
     ORDER BY m.id ASC`
  )
    .bind(date, excludeId)
    .all<{
      id: number;
      meeting_type: string;
      start_type: string;
      start_time: string | null;
      committee_name: string | null;
    }>();

  const items = results.map((r) => ({
    id: r.id,
    label: `${r.meeting_type === "committee" ? (r.committee_name ?? "委員会") : "本会議"}(${
      r.start_type === "fixed" ? r.start_time : "前の会議終了後"
    })`,
  }));
  return c.json({ items });
});
