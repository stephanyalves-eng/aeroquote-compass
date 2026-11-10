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
