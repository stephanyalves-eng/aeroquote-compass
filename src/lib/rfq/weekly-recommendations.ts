export interface WeeklyRecommendationRow {
  week: string;
  real: number | null;
  demo: number | null;
  coverage: "Not tracked" | "Partial" | "Complete";
}
export interface WeeklyRecommendationSnapshot {
  updatedAt: string;
  trackingStartedAt: string;
  weeks: WeeklyRecommendationRow[];
}
/** Aggregate collector snapshot only: never infer missing history from RFQ audit dates. */
export const WEEKLY_RECOMMENDATION_SNAPSHOT: WeeklyRecommendationSnapshot = {
  updatedAt: "2026-11-10T01:08:39Z",
  trackingStartedAt: "2026-11-10T00:59:57Z",
  weeks: [
    { week: "2026-10-19", real: null, demo: null, coverage: "Not tracked" },
    { week: "2026-10-26", real: null, demo: null, coverage: "Not tracked" },
    { week: "2026-11-02", real: null, demo: null, coverage: "Not tracked" },
    { week: "2026-11-09", real: 0, demo: 0, coverage: "Partial" },
  ],
};
export function weeklyRecommendationSummary(rows: WeeklyRecommendationRow[]) {
  const tracked = rows.filter((row) => row.coverage !== "Not tracked");
  return {
    real: tracked.reduce((total, row) => total + (row.real ?? 0), 0),
    demo: tracked.reduce((total, row) => total + (row.demo ?? 0), 0),
    trackedWeeks: tracked.length,
  };
}
export function weeklyRecommendationLabel(week: string) {
  return new Date(`${week}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export type RecommendationPeriod = "4" | "8" | "12" | "custom";
const DAY = 86_400_000;
export function saoPauloDate(at: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}
export function mondayOf(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function recommendationPeriodRange(
  period: Exclude<RecommendationPeriod, "custom">,
  at: string,
) {
  const end = saoPauloDate(at);
  const start = new Date(`${mondayOf(end)}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (Number(period) - 1) * 7);
  return { start: start.toISOString().slice(0, 10), end };
}
export function weeklyRecommendationRows(
  snapshot: WeeklyRecommendationSnapshot,
  start: string,
  end: string,
) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) return { rows: [], error: "Choose valid start and end dates." };
  if (start > end) return { rows: [], error: "Start date must be on or before end date." };
  if (end > saoPauloDate(snapshot.updatedAt))
    return { rows: [], error: "End date cannot be in the future." };
  if ((Date.parse(end) - Date.parse(start)) / DAY > 365)
    return { rows: [], error: "Choose a period of up to one year." };
  const current = mondayOf(saoPauloDate(snapshot.updatedAt));
  const trackingDate = saoPauloDate(snapshot.trackingStartedAt);
  const trackingWeek = mondayOf(trackingDate);
  const first = mondayOf(start);
  const last = mondayOf(end);
  const rows: WeeklyRecommendationRow[] = [];
  for (
    let time = Date.parse(`${first}T12:00:00Z`);
    time <= Date.parse(`${last}T12:00:00Z`);
    time += 7 * DAY
  ) {
    const week = new Date(time).toISOString().slice(0, 10);
    const tracked = week >= trackingWeek;
    const counts = snapshot.weeks.find((row) => row.week === week);
    rows.push({
      week,
      real: tracked ? (counts?.real ?? 0) : null,
      demo: tracked ? (counts?.demo ?? 0) : null,
      coverage: !tracked
        ? "Not tracked"
        : week === current || (week === trackingWeek && (trackingDate !== week || new Date(snapshot.trackingStartedAt).toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo" }) !== "00:00:00"))
          ? "Partial"
          : "Complete",
    });
  }
  return { rows, error: null };
}
