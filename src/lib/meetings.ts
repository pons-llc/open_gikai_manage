export type ChainableMeeting = {
  id: number;
  start_type: "fixed" | "after_previous";
  start_time: string | null;
  previous_meeting_id: number | null;
};

/**
 * design.md §3.3: 同一日の並び順は
 *   1. start_type='fixed' は start_time 順
 *   2. after_previous は参照先会議の直後に挿入(チェーンをたどって展開)
 * 呼び出し側は同一 date の meetings のみを渡すこと。
 */
export function sortMeetingsByChain<T extends ChainableMeeting>(meetings: T[]): T[] {
  const byId = new Map<number, T>(meetings.map((m) => [m.id, m]));
  const followersOf = new Map<number, T[]>();
  const backbone: T[] = [];

  for (const m of meetings) {
    if (m.start_type === "after_previous" && m.previous_meeting_id !== null && byId.has(m.previous_meeting_id)) {
      const list = followersOf.get(m.previous_meeting_id) ?? [];
      list.push(m);
      followersOf.set(m.previous_meeting_id, list);
    } else {
      // fixed 開始、または previous が同一日集合に無い(データ不整合時のフォールバック)は backbone 扱い
      backbone.push(m);
    }
  }

  backbone.sort((a, b) => {
    if (a.start_type === "fixed" && b.start_type === "fixed") {
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    }
    return a.id - b.id;
  });
  for (const followers of followersOf.values()) {
    followers.sort((a, b) => a.id - b.id);
  }

  const result: T[] = [];
  const seen = new Set<number>();
  const visit = (m: T) => {
    if (seen.has(m.id)) return; // 循環データ(本来は保存時に弾いているはずだが無限ループ防止)
    seen.add(m.id);
    result.push(m);
    for (const follower of followersOf.get(m.id) ?? []) visit(follower);
  };
  for (const m of backbone) visit(m);
  // backbone から辿れなかった孤立 after_previous(previous が同一日に存在しない不整合データ)を末尾に追加
  for (const m of meetings) {
    if (!seen.has(m.id)) {
      result.push(m);
      seen.add(m.id);
    }
  }
  return result;
}

/**
 * §3.3: previous_meeting_id は同一 date のみ選択可・自己参照禁止・循環参照禁止。
 * ここでは循環参照(previousMeetingId から辿って meetingId — 編集中の自分自身 — に到達するか)を検出する。
 * meetingId が null(新規作成)の場合は「同じ chain を二重に辿る」ケースのみ検出すればよい。
 */
export async function wouldCreateCycle(
  db: D1Database,
  meetingId: number | null,
  previousMeetingId: number
): Promise<boolean> {
  let currentId: number | null = previousMeetingId;
  const visited = new Set<number>();
  while (currentId !== null) {
    if (meetingId !== null && currentId === meetingId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const row: { previous_meeting_id: number | null } | null = await db
      .prepare(`SELECT previous_meeting_id FROM meetings WHERE id = ?`)
      .bind(currentId)
      .first<{ previous_meeting_id: number | null }>();
    if (!row) return false;
    currentId = row.previous_meeting_id;
  }
  return false;
}
