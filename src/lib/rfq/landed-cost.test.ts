import { describe, it, expect } from "vitest";
import { buildLandedCostBreakdown } from "./landed-cost";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
describe("Phase 2 landed cost reconciliation", () => {
  const list = compareDocuments(sampleDocuments, sampleReference, DEFAULT_WEIGHTS);
  it.each(["Polar Aerospace INC", "Helix Precision SA", "Atlas Controls INC", "Meridian Flight Components LLC"])("reconciles every component exactly for %s", (name) => {
    const a = list.find((x) => x.name === name); if (!a) throw new Error("Missing sample supplier");
    const b = buildLandedCostBreakdown(a, { reference: sampleReference });
    expect(b.validationErrors).toEqual([]);
    expect(b.annualTotal).toBe(a.annualLanded);
    expect(b.components.reduce((sum, c) => sum + c.amountUsd, 0)).toBe(a.annualLanded);
  });
  it("blocks missing currency instead of a zero total", () => { const q = sampleDocuments[0]?.reviewed; if (!q) throw new Error("Missing quote"); const b = buildLandedCostBreakdown({ ...q, currency: null }, { reference: sampleReference }); expect(b.annualTotal).toBeNull(); expect(b.validationErrors.length).toBeGreaterThan(0); });
  it.each([0, NaN])("blocks invalid annual quantity %s", (annualVolume) => { const a = list[0]; if (!a) throw new Error("Missing supplier"); expect(buildLandedCostBreakdown(a, { reference: sampleReference, annualVolume }).annualTotal).toBeNull(); });
  it("blocks missing unit price", () => { const q = sampleDocuments[0]?.reviewed; if (!q) throw new Error("Missing quote"); expect(buildLandedCostBreakdown({ ...q, unit_price: null }, { reference: sampleReference }).annualTotal).toBeNull(); });
  it("blocks invalid one-time FX", () => { const q = sampleDocuments[0]?.reviewed; if (!q) throw new Error("Missing quote"); const b = buildLandedCostBreakdown({ ...q, one_time_costs: [{ type: "FAI", currency: "EUR", amount: 2800 }] }, { reference: sampleReference, eurBrl: 0 }); expect(b.annualTotal).toBeNull(); expect(b.validationErrors.length).toBeGreaterThan(0); });
  it("labels one-time costs charged fully in year one", () => { const a = list.find((x) => x.name.startsWith("Polar")); if (!a) throw new Error("Missing Polar"); expect(buildLandedCostBreakdown(a, { reference: sampleReference }).components.find((c) => c.label === "Tooling")).toMatchObject({ amountUsd: 6500, treatment: "first_year_full", note: "Charged in full in year 1; excluded from later years" }); });
  it("marks buyer edits and applies parameterized overrides without double counting", () => { const a = list.find((x) => x.name.startsWith("Atlas")); if (!a) throw new Error("Missing Atlas"); const edited = { ...a, baseline: { ...a.baseline, quote: { ...a.baseline.quote, unit_price: 18000 } } }; const b = buildLandedCostBreakdown(edited, { reference: sampleReference, annualVolume: 12, freightOverride: 1000, extraCosts: [{ label: "Inspection", amount: 50, currency: "USD" }] }); expect(b.annualTotal).toBe(217050); expect(b.components.find((c) => c.key === "material")?.source).toBe("buyer"); expect(b.components.some((c) => c.key === "estimate")).toBe(false); });
});