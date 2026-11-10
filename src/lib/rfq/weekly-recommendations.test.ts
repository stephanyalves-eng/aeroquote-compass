import { describe, expect, it } from "vitest";
import {
  weeklyRecommendationSummary,
  weeklyRecommendationLabel,
  WEEKLY_RECOMMENDATION_SNAPSHOT,
} from "./weekly-recommendations";
describe("Weekly buyer-confirmed recommendation display", () => {
  it("separates real RFQs from demos and ignores untracked weeks", () => {
    expect(
      weeklyRecommendationSummary([
        { week: "2026-10-26", real: null, demo: null, coverage: "Not tracked" },
        { week: "2026-11-02", real: 4, demo: 2, coverage: "Complete" },
        { week: "2026-11-09", real: 3, demo: 8, coverage: "Partial" },
      ]),
    ).toEqual({ real: 7, demo: 10, trackedWeeks: 2 });
  });
  it("never turns pre-instrumentation history into zero recommendations", () => {
    const rows = WEEKLY_RECOMMENDATION_SNAPSHOT.weeks;
    expect(
      rows
        .slice(0, 3)
        .every((row) => row.real === null && row.demo === null && row.coverage === "Not tracked"),
    ).toBe(true);
    expect(rows[3]).toEqual({ week: "2026-11-09", real: 0, demo: 0, coverage: "Partial" });
    expect(weeklyRecommendationSummary(rows)).toEqual({ real: 0, demo: 0, trackedWeeks: 1 });
  });
  it("keeps Monday labels in São Paulo without shifting to Sunday", () => {
    expect(weeklyRecommendationLabel("2026-11-09")).toBe("Nov 9");
  });
});
