import { describe, expect, it } from "vitest";
import {
  weeklyRecommendationSummary,
  weeklyRecommendationLabel,
  WEEKLY_RECOMMENDATION_SNAPSHOT,
  recommendationPeriodRange,
  weeklyRecommendationRows,
  mondayOf,
  saoPauloDate,
  weeklyRecommendationComparison,
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
  it("selects four calendar weeks ending in the current São Paulo week", () => {
    expect(recommendationPeriodRange("4", "2026-11-10T01:22:00Z")).toEqual({
      start: "2026-10-19",
      end: "2026-11-09",
    });
  });
  it("selects eight and twelve calendar weeks", () => {
    expect(recommendationPeriodRange("8", "2026-11-10T01:22:00Z").start).toBe("2026-09-21");
    expect(recommendationPeriodRange("12", "2026-11-10T01:22:00Z").start).toBe("2026-08-24");
  });
  it("uses Monday boundaries in São Paulo, not UTC", () => {
    expect(saoPauloDate("2026-11-09T02:59:59Z")).toBe("2026-11-08");
    expect(mondayOf(saoPauloDate("2026-11-09T02:59:59Z"))).toBe("2026-11-02");
  });
  const live = {
    updatedAt: "2026-11-17T12:00:00Z",
    trackingStartedAt: "2026-11-10T02:00:00Z",
    weeks: [
      { week: "2026-11-09", real: 3, demo: 2, coverage: "Partial" as const },
      { week: "2026-11-16", real: 5, demo: 4, coverage: "Partial" as const },
    ],
  };
  it("custom ranges filter totals and use whole weeks", () => {
    const filtered = weeklyRecommendationRows(live, "2026-11-11", "2026-11-12");
    expect(filtered.rows.map((row) => row.week)).toEqual(["2026-11-09"]);
    expect(weeklyRecommendationSummary(filtered.rows)).toEqual({
      real: 3,
      demo: 2,
      trackedWeeks: 1,
    });
  });
  it("distinguishes untracked history, partial start/current weeks and known zeros", () => {
    const result = weeklyRecommendationRows(
      { ...live, updatedAt: "2026-11-30T12:00:00Z" },
      "2026-11-02",
      "2026-11-30",
    );
    expect(result.rows[0]).toEqual({
      week: "2026-11-02",
      real: null,
      demo: null,
      coverage: "Not tracked",
    });
    expect(result.rows[1]?.coverage).toBe("Partial");
    expect(result.rows[3]).toEqual({ week: "2026-11-23", real: 0, demo: 0, coverage: "Complete" });
    expect(result.rows[4]?.coverage).toBe("Partial");
  });
  it("rejects reversed, future, invalid and overly long ranges", () => {
    expect(weeklyRecommendationRows(live, "2026-11-12", "2026-11-11").error).not.toBeNull();
    expect(weeklyRecommendationRows(live, "2026-11-12", "2026-11-18").error).not.toBeNull();
    expect(weeklyRecommendationRows(live, "2026-02-30", "2026-11-17").error).not.toBeNull();
    expect(weeklyRecommendationRows(live, "2025-01-01", "2026-11-17").error).not.toBeNull();
  });
});

describe("Previous weekly recommendation period", () => {
  const snapshot = {
    updatedAt: "2026-11-10T12:00:00Z",
    trackingStartedAt: "2026-08-03T03:00:00Z",
    weeks: [
      { week: "2026-10-26", real: 4, demo: 8, coverage: "Complete" as const },
      { week: "2026-11-02", real: 6, demo: 4, coverage: "Complete" as const },
      { week: "2026-11-09", real: 3, demo: 2, coverage: "Partial" as const },
    ],
  };
  it("compares adjacent custom whole-week windows with totals and percentage", () => {
    expect(
      weeklyRecommendationComparison(snapshot, "2026-11-04", "2026-11-05", "real"),
    ).toMatchObject({
      selectedRange: { start: "2026-11-02", end: "2026-11-08" },
      previousRange: { start: "2026-10-26", end: "2026-11-01" },
      currentTotal: 6,
      previousTotal: 4,
      difference: 2,
      percentage: 50,
      partial: false,
      weeks: 1,
    });
  });
  it("separates demo totals and calculates decreases", () => {
    expect(
      weeklyRecommendationComparison(snapshot, "2026-11-02", "2026-11-08", "demo"),
    ).toMatchObject({
      currentTotal: 4,
      previousTotal: 8,
      difference: -4,
      percentage: -50,
    });
  });
  it.each(["4", "8", "12"] as const)(
    "uses an equally sized non-overlapping previous %s-week window",
    (period) => {
      const range = recommendationPeriodRange(period, snapshot.updatedAt);
      const result = weeklyRecommendationComparison(snapshot, range.start, range.end, "real");
      expect(result?.weeks).toBe(Number(period));
      expect(result?.previousRange.end).toBe(
        new Date(Date.parse(`${range.start}T12:00:00Z`) - 86400000).toISOString().slice(0, 10),
      );
      expect(
        (Date.parse(result?.previousRange.end ?? "") -
          Date.parse(result?.previousRange.start ?? "")) /
          86400000 +
          1,
      ).toBe(Number(period) * 7);
    },
  );
  it("leaves changes unknown when previous tracking is unavailable", () => {
    expect(
      weeklyRecommendationComparison(
        WEEKLY_RECOMMENDATION_SNAPSHOT,
        "2026-11-09",
        "2026-11-09",
        "real",
      ),
    ).toMatchObject({
      currentTotal: 0,
      previousTotal: null,
      difference: null,
      percentage: null,
      partial: true,
    });
  });
  it("flags current-week comparisons as provisional", () => {
    expect(
      weeklyRecommendationComparison(snapshot, "2026-11-09", "2026-11-09", "real"),
    ).toMatchObject({
      difference: -3,
      percentage: -50,
      partial: true,
    });
  });
  it("does not divide by a zero baseline", () => {
    expect(
      weeklyRecommendationComparison(
        { ...snapshot, weeks: snapshot.weeks.slice(1) },
        "2026-11-02",
        "2026-11-08",
        "real",
      ),
    ).toMatchObject({
      previousTotal: 0,
      difference: 6,
      percentage: null,
    });
  });
  it("reports equal known-zero totals as zero change", () => {
    expect(
      weeklyRecommendationComparison(
        { ...snapshot, weeks: [] },
        "2026-11-02",
        "2026-11-08",
        "real",
      ),
    ).toMatchObject({
      currentTotal: 0,
      previousTotal: 0,
      difference: 0,
      percentage: null,
    });
  });
  it("does not compare invalid dates", () => {
    expect(weeklyRecommendationComparison(snapshot, "2026-11-09", "2026-11-02", "real")).toBeNull();
  });
});
