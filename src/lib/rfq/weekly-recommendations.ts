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
        : week === current ||
            (week === trackingWeek &&
              (trackingDate !== week ||
                new Date(snapshot.trackingStartedAt).toLocaleTimeString("en-GB", {
                  timeZone: "America/Sao_Paulo",
                }) !== "00:00:00"))
          ? "Partial"
          : "Complete",
    });
  }
  return { rows, error: null };
}

/** Compare adjacent, equally sized whole-week windows, never unknown history against zero. */
export function weeklyRecommendationComparison(
  snapshot: WeeklyRecommendationSnapshot,
  start: string,
  end: string,
  mode: "real" | "demo",
) {
  const selected = weeklyRecommendationRows(snapshot, start, end);
  if (selected.error || selected.rows.length === 0) return null;
  const first = selected.rows[0];
  const last = selected.rows.at(-1);
  if (!first || !last) return null;
  const shift = (date: string, days: number) =>
    new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  const previousRange = {
    start: shift(first.week, -selected.rows.length * 7),
    end: shift(first.week, -1),
  };
  const previous = weeklyRecommendationRows(snapshot, previousRange.start, previousRange.end);
  const total = (rows: WeeklyRecommendationRow[]) =>
    rows.some((row) => row.coverage === "Not tracked" || row[mode] === null)
      ? null
      : rows.reduce((sum, row) => sum + (row[mode] ?? 0), 0);
  const currentTotal = total(selected.rows);
  const previousTotal = total(previous.rows);
  const difference =
    currentTotal === null || previousTotal === null ? null : currentTotal - previousTotal;
  return {
    selectedRange: { start: first.week, end: shift(last.week, 6) },
    previousRange,
    currentTotal,
    previousTotal,
    difference,
    percentage:
      difference === null || previousTotal === null || previousTotal === 0
        ? null
        : (difference / previousTotal) * 100,
    partial: [...selected.rows, ...previous.rows].some((row) => row.coverage === "Partial"),
    weeks: selected.rows.length,
  };
}

/** "1 tracked week" / "3 tracked weeks". */
export function trackedWeeksLabel(count: number) {
  return `${count} tracked ${count === 1 ? "week" : "weeks"}`;
}
/** Plain-language period total; unknown history is never shown as a number. */
export function periodTotalLabel(total: number | null) {
  return total === null ? "Not tracked yet" : `${total} ${total === 1 ? "RFQ" : "RFQs"}`;
}
/**
 * Single range definition for the widget: whole Monday-start weeks, with the end
 * clamped to today (São Paulo) and flagged "to date" for the current incomplete week.
 */
export function recommendationDisplayRange(start: string, end: string, updatedAt: string) {
  const today = saoPauloDate(updatedAt);
  const first = mondayOf(start);
  const lastSunday = new Date(Date.parse(`${mondayOf(end)}T12:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  const toDate = lastSunday >= today;
  const finish = toDate ? today : lastSunday;
  return { start: first, end: finish, toDate, label: `${first} – ${finish}${toDate ? " (to date)" : ""}` };
}
/** The chart is only drawn when at least one tracked week has a recommendation in the selected series. */
export function hasRecommendationData(rows: WeeklyRecommendationRow[], mode: "real" | "demo") {
  return rows.some((row) => (row[mode] ?? 0) > 0);
}
