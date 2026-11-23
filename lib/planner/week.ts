// Week helpers in Bulgarian time (Europe/Sofia).

/** Today's date in Sofia as YYYY-MM-DD. */
export function sofiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Monday of the week a new plan is for: the current week until Wednesday, otherwise next week
 * (late in the week people shop for the coming one).
 */
export function planWeekStart(now = new Date()): string {
  const today = sofiaToday(now);
  const wd = weekdayIndex(today);
  return wd <= 2 ? addDays(today, -wd) : addDays(today, 7 - wd);
}

/** Index (0–6) of today within the plan week, or 0 when today is outside it. */
export function todayIndexInWeek(weekStart: string, now = new Date()): number {
  const today = sofiaToday(now);
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86_400_000);
  return diff >= 0 && diff < 7 ? diff : 0;
}

/** "23.11" style date for day tabs and headers. */
export function shortDate(weekStart: string, offset = 0): string {
  const [, m, d] = addDays(weekStart, offset).split("-");
  return `${Number(d)}.${m}`;
}
