import { describe, it, expect } from "vitest";
import { SAMPLE_CATALOG, extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, decisionInsights, DEFAULT_WEIGHTS } from "./intelligence";
import { buildLandedCostBreakdown } from "./landed-cost";
import { newReference, canCompare } from "./workflow";
import { explorerRows, filterAndSort, statusTotals, EMPTY_FILTERS, chartFocus } from "./quote-explorer";
import { demoRevisionRegistry, currentRevision, publishRevision, createSnapshot, detectRevisionChanges, createImpactAssessment, unresolvedRevisionAlerts, configurationGate, gateBlocked, revisionMatrix, verificationStatement, compareRevision } from "./revisions";
import { investigateFailure, confirmClassification } from "./investigation";
import { demoInvestigationCases } from "./investigation-demo";
import { buildTimeline, filterTimeline, EMPTY_TIMELINE_FILTER } from "./audit-timeline";

const ref = { ...newReference(), today: "2026-10-25", demoAnalysis: true, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, requiredDeliveryDate: "2027-03-15", incumbentSupplier: "Meridian Flight Components LLC" };
const docs = confirmValidatedSamples(extendedSampleDocuments());
const list = compareDocuments(docs, ref, DEFAULT_WEIGHTS);
const insight = decisionInsights(list, ref);
const rows = explorerRows(docs, list, "RFQ-24410", insight.recommended?.document.id ?? null);

describe("20 sample quotes", () => {
  it("has exactly 20 with unique ids, quote ids, file names and suppliers", () => {
    expect(SAMPLE_CATALOG).toHaveLength(20);
    for (const k of ["id", "fileName"] as const) expect(new Set(SAMPLE_CATALOG.map((s) => s[k])).size).toBe(20);
    expect(new Set(SAMPLE_CATALOG.map((s) => s.quote.quote_id)).size).toBe(20);
    expect(new Set(SAMPLE_CATALOG.map((s) => s.quote.supplier_name)).size).toBe(20);
  });
  it("status distribution meets the minimums (8 / 4 / 4 / 4)", () => {
    const t = statusTotals(rows);
    expect(t).toEqual({ total: 20, eligible: 8, caveats: 4, notEligible: 4, awaiting: 4 });
    expect(canCompare(docs, ref)).toBe(true);
  });
  it("landed-cost components reconcile for every calculated quote", () => {
    expect(list).toHaveLength(16);
    for (const a of list) { const b = buildLandedCostBreakdown(a, { reference: ref }); expect(b.annualTotal).toBeCloseTo(a.annualLanded!, 6); }
  });
  it("recommends the best-scoring eligible supplier, never a blocked one", () => {
    const rec = insight.recommended!;
    expect(rec.eligible).toBe(true);
    expect(Math.max(...list.filter((a) => a.eligible).map((a) => a.score ?? -1))).toBe(rec.score);
    expect(rec.name).toBe("Horizon Precision LLC");
    const cheapest = list[0]!; expect(cheapest.name).toBe("Falcon Machining INC"); expect(cheapest.eligible).toBe(false);
  });
  it("lowest unit price is not the lowest landed cost", () => {
    const eligible = list.filter((a) => a.eligible);
    const lowUnit = [...eligible].sort((a, b) => a.baseline.unitPriceUsd! - b.baseline.unitPriceUsd!)[0]!;
    expect(lowUnit.name).toBe("Cascade Hydraulics LLC");
    expect(lowUnit.annualLanded!).toBeGreaterThan(insight.recommended!.annualLanded!);
  });
  it("cost edits flow through to the recommendation", () => {
    const edited = docs.map((d) => d.id === "sample-11" ? { ...d, reviewed: { ...d.reviewed!, unit_price: 21000 } } : d);
    expect(decisionInsights(compareDocuments(edited, ref, DEFAULT_WEIGHTS), ref).recommended?.name).not.toBe("Horizon Precision LLC");
  });
});

describe("search, filters and sorting", () => {
  it("search matches supplier, quote id and part number", () => {
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, search: "falcon" }).map((r) => r.id)).toEqual(["sample-09"]);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, search: "QM-77" })).toHaveLength(1);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, search: "PN-45Y1285" })).toHaveLength(1);
  });
  it("filters by revision, currency and view without mutating input", () => {
    const before = JSON.stringify(rows);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, revision: "B" }).map((r) => r.id)).toEqual(["sample-03"]);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, currency: "EUR" })).toHaveLength(2);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, view: "blocked" })).toHaveLength(4);
    expect(filterAndSort(rows, { ...EMPTY_FILTERS, view: "selected", selected: ["sample-01", "sample-20"] })).toHaveLength(2);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("sorts stably with missing values last", () => {
    const sorted = filterAndSort(rows, { ...EMPTY_FILTERS, sort: "landed" });
    expect(sorted.slice(-4).every((r) => r.landed == null)).toBe(true);
    expect(sorted.slice(-4).map((r) => r.id)).toEqual(["sample-13", "sample-14", "sample-15", "sample-16"]);
    const score = filterAndSort(rows, { ...EMPTY_FILTERS, sort: "score" }); expect(score[0]!.score).toBeGreaterThanOrEqual(score[1]!.score!);
  });
  it("charts focus on 6 suppliers including the recommendation", () => {
    const f = chartFocus(list, insight.recommended!.document.id, [], false);
    expect(f).toHaveLength(6); expect(f.some((a) => a.document.id === insight.recommended!.document.id)).toBe(true);
    expect(chartFocus(list, null, [], true)).toHaveLength(16);
  });
});

describe("revision control and snapshots", () => {
  const reg = demoRevisionRegistry();
  it("selects the current revision by dates, not order", () => {
    expect(currentRevision([...reg].reverse(), "drawing", "DWG-45210", "2026-09-01")?.revision).toBe("C");
    expect(currentRevision(reg, "drawing", "DWG-45210", "2026-05-01")?.revision).toBe("B");
    expect(compareRevision(reg, "drawing", "DWG-45210", "B", "2026-10-25")).toBe("outdated");
    expect(compareRevision(reg, "drawing", "DWG-45210", null, "2026-10-25")).toBe("missing");
  });
  it("snapshots are immutable and survive a new revision", () => {
    const snap = createSnapshot(reg, { id: "s1", at: "2026-11-09", timestamp: "2026-11-09T12:00:00Z", checkType: "PO verification", actor: "x", supplier: "Horizon", partNumber: "PN-45Y1258", quoteRevision: "C", foundRevision: "C", sourceDocuments: ["DWG-45210"], result: "Confirmed", divergences: [], tolerances: null, justifications: [], finalStatus: "ok" });
    expect(() => { (snap as { drawingRevision: string }).drawingRevision = "Z"; }).toThrow();
    const next = publishRevision(reg, { kind: "drawing", documentNumber: "DWG-45210", revision: "D", effectiveFrom: "2026-11-15", owner: "x", changeReason: "y" });
    expect(snap.drawingRevision).toBe("C");
    expect(reg.find((r) => r.id === "dwg-c")?.status).toBe("Current");
    expect(next.find((r) => r.id === "dwg-c")?.status).toBe("Superseded");
    const alerts = detectRevisionChanges(next, [snap], "2026-11-16");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toBe("PO verification was completed against revision C. Revision D became current afterwards. Re-evaluate the quotation and PO before manufacturing.");
    expect(() => createImpactAssessment(alerts[0]!, "No known impact", " ", "x", "t")).toThrow();
    expect(unresolvedRevisionAlerts(alerts, [createImpactAssessment(alerts[0]!, "Requires new PO Check", "j", "x", "t1")])).toHaveLength(1);
    expect(unresolvedRevisionAlerts(alerts, [createImpactAssessment(alerts[0]!, "No known impact", "j", "x", "t1")])).toHaveLength(0);
  });
  it("blocks a PO on an outdated revision and releases a correct one", () => {
    const g = (rev: string | null, alerts = [] as ReturnType<typeof detectRevisionChanges>) => configurationGate({ registry: reg, at: "2026-10-25", poRevision: rev, quoteRevision: "C", alerts, assessments: [] });
    expect(gateBlocked(g("B"))).toBe(true);
    expect(gateBlocked(g(null))).toBe(true);
    expect(gateBlocked(g("C"))).toBe(false);
    expect(gateBlocked(configurationGate({ registry: reg, at: "2026-10-25", poRevision: "C", quoteRevision: "C", alerts: [], assessments: [], documentReferences: ["DWG-45210"] }))).toBe(true);
    expect(verificationStatement(reg, "2026-11-09", "2026-11-09")).toBe("PO verified against drawing DWG-45210, revision C, and RFQ-24410, version 2, on 9 November 2026.");
  });
  it("matrix highlights the first broken link", () => {
    const m = revisionMatrix(reg, "2026-10-25", [{ stage: "RFQ", found: "C", checkedAt: "x" }, { stage: "Quotation", found: "B", checkedAt: "x", blockerOnMismatch: true }, { stage: "Inspection", found: "B", checkedAt: "x" }]);
    expect(m.map((r) => r.status)).toEqual(["Confirmed", "Blocker", "Divergence"]);
    expect(m.map((r) => r.firstBreak)).toEqual([false, true, false]);
  });
});

describe("failure investigation", () => {
  const cases = demoInvestigationCases();
  const suggestion = (i: number) => { const c = cases[i]!; return investigateFailure(c.failure, c.snapshots, c.registry, c.manufacturedOn); };
  it("classifies the three demo cases", () => {
    expect(suggestion(0).suggested).toBe("Documentation changed after verification");
    expect(suggestion(1).suggested).toBe("Existing divergence not detected");
    expect(suggestion(2).suggested).toBe("Process correct, failure unrelated to documentation");
  });
  it("reports insufficient evidence without a check and requires a note to override", () => {
    const c = cases[0]!;
    expect(investigateFailure(c.failure, [], c.registry, c.manufacturedOn).suggested).toBe("Insufficient evidence");
    expect(() => confirmClassification(suggestion(0), "Insufficient evidence", "x", "")).toThrow();
    expect(confirmClassification(suggestion(0), "Documentation changed after verification", "x", "").confirmed).toBe("Documentation changed after verification");
  });
  it("timeline orders events and filters by type", () => {
    const c = cases[0]!;
    const t = buildTimeline({ registry: c.registry, snapshots: c.snapshots, audit: [], assessments: [], failures: [c.failure], investigations: [], supplierOf: () => "—", partNumber: "PN-45Y1258" });
    expect(t.map((e) => e.timestamp)).toEqual([...t.map((e) => e.timestamp)].sort());
    expect(filterTimeline(t, { ...EMPTY_TIMELINE_FILTER, type: "New revision published" }).map((e) => e.revision)).toEqual(["C", "D"]);
    expect(filterTimeline(t, { ...EMPTY_TIMELINE_FILTER, type: "Inspection failure" })).toHaveLength(1);
  });
});
