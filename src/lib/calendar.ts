export type CalendarDay = { date: string; inMonth: boolean };

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** 指定年月(1-12)のカレンダーグリッドを週単位(日曜始まり)で組み立てる。前後月の日で欠けを埋める。 */
export const buildMonthGrid = (year: number, month: number): CalendarDay[][] => {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = 日曜
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: CalendarDay[] = [];
  for (let i = startWeekday; i > 0; i--) {
    cells.push({ date: toIsoDate(new Date(Date.UTC(year, month - 1, 1 - i))), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toIsoDate(new Date(Date.UTC(year, month - 1, day))), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const [y, m, d] = cells[cells.length - 1].date.split("-").map(Number);
    cells.push({ date: toIsoDate(new Date(Date.UTC(y, m - 1, d + 1))), inMonth: false });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

/** 指定年月の初日・末日(YYYY-MM-DD)。日程一覧のクエリ範囲に使う。 */
export const monthRange = (year: number, month: number): { from: string; to: string } => ({
  from: `${year}-${String(month).padStart(2, "0")}-01`,
  to: toIsoDate(new Date(Date.UTC(year, month, 0))),
});

/** 前月/次月への移動(年またぎを正しく処理する)。 */
export const shiftMonth = (year: number, month: number, delta: number): { year: number; month: number } => {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
};
