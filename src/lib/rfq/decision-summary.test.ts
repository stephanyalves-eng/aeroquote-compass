import { describe, it, expect } from "vitest";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, decisionInsights, DEFAULT_WEIGHTS } from "./intelligence";
import { buildLandedCostBreakdown } from "./landed-cost";
import { newReference } from "./workflow";
import { buildDecisionSummary, NOT_RECORDED, summaryCsv } from "./decision-summary";
import { createApprovedDecision } from "./recommendation";
import { createAuditEvent } from "./audit";
import { describeAudit } from "./audit-describe";
import { buildTimeline } from "./audit-timeline";
import { demoRevisionRegistry } from "./revisions";
import { buildApprovedPoContext, loadAndCheckPo, DEFAULT_PO_TOLERANCES } from "./po-check";
import { demoPurchaseOrder } from "./po-samples";

const ref = { ...newReference(), today: "2026-10-25", demoAnalysis: true, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, requiredDeliveryDate: "2027-03-15", incumbentSupplier: "Meridian Flight Components LLC" };
const all = confirmValidatedSamples(extendedSampleDocuments());
const sets = { classic: all.slice(0, 4), extended: all };
const KEY = /\b[a-z]+_[a-z_]+\b|[a-z]+[A-Z][a-zA-Z]+\b|[{}]/; // snake_case, camelCase or raw JSON

describe("auditable decision summary", () => {
  for (const [label, docs] of Object.entries(sets)) it(`${label}: breakdown components sum to annual landed cost for every supplier`, () => {
    const list = compareDocuments(docs, ref, DEFAULT_WEIGHTS);
    expect(list.length).toBe(label === "classic" ? 4 : 16);
    for (const a of list) { const b = buildLandedCostBreakdown(a, { reference: ref }); expect(b.components.reduce((n, c) => n + c.amountUsd, 0)).toBeCloseTo(a.annualLanded!, 6); }
  });
  it("classic set keeps Atlas recommended at $230,256", () => {
    const i = decisionInsights(compareDocuments(sets.classic, ref, DEFAULT_WEIGHTS), ref);
    expect(i.recommended?.name).toBe("Atlas Controls INC"); expect(Math.round(i.recommended!.annualLanded!)).toBe(230256); expect(Math.round(i.savings!)).toBe(7544);
  });
  const list = compareDocuments(all, ref, DEFAULT_WEIGHTS);
  it("says Not yet recorded without decision or PO", () => {
    const s = buildDecisionSummary({ reference: ref, documents: all, list, weights: DEFAULT_WEIGHTS, snapshots: [], timeline: [] });
    expect(s.map((x) => x.title)).toEqual(["RFQ header", "Reviewed data per supplier", "Supplier comparison", "Landed-cost composition", "Scores and weight breakdown", "Risks and eligibility", "Recommendation and explanation", "Recorded decision", "PO Check result", "PO discrepancy table", "Revision snapshots used by checks", "Audit timeline"]);
    for (const t of ["Recorded decision", "PO Check result", "PO discrepancy table"]) expect(s.find((x) => x.title === t)!.rows[0]![0]).toBe(NOT_RECORDED);
  });
  it("contains decision, override justification, PO discrepancies and timeline; never internal keys", () => {
    const blocked = list.find((a) => !a.eligible)!, alt = list.find((a) => a.eligible && a.name !== "Horizon Precision LLC")!;
    expect(() => createApprovedDecision(list, ref, DEFAULT_WEIGHTS, blocked.document.id, "x", "t")).toThrow();
    expect(() => createApprovedDecision(list, ref, DEFAULT_WEIGHTS, alt.document.id, "", "t")).toThrow();
    const decision = createApprovedDecision(list, ref, DEFAULT_WEIGHTS, alt.document.id, "Shorter qualification path.", "2026-10-25T12:00:00.000Z");
    const ctx = buildApprovedPoContext(ref, alt, decision);
    const poState = loadAndCheckPo(demoPurchaseOrder(ctx, "Blocked PO"), ctx, DEFAULT_PO_TOLERANCES);
    const audit = [createAuditEvent({ id: "1", timestamp: "2026-10-25T12:00:00.000Z", action: "Field edited", documentId: alt.document.id, field: "unit_price", previousValue: 1, newValue: 2 }),
      createAuditEvent({ id: "2", timestamp: "2026-10-25T12:01:00.000Z", action: "Weights changed", details: { previousWeights: DEFAULT_WEIGHTS, weights: { ...DEFAULT_WEIGHTS, cost: 50, commercial: 0 } } }),
      createAuditEvent({ id: "3", timestamp: "2026-10-25T12:02:00.000Z", action: "Extraction completed", documentId: alt.document.id, details: { fileName: "a.txt", source: "Demo pre-extraction (synthetic, no AI call)", confidences: { unit_price: 95 } } })];
    const timeline = buildTimeline({ registry: demoRevisionRegistry(), snapshots: [], audit, assessments: [], failures: [], investigations: [], supplierOf: () => alt.name, partNumber: "PN-45Y1258" });
    expect(timeline.filter((e) => e.id.startsWith("audit-"))).toHaveLength(3);
    const s = buildDecisionSummary({ reference: ref, documents: all, list, weights: DEFAULT_WEIGHTS, approvedDecision: decision, poState, snapshots: [], timeline });
    const get = (t: string) => s.find((x) => x.title === t)!.rows;
    expect(get("Recorded decision")).toContainEqual(["Justification", "Shorter qualification path."]);
    expect(get("Recorded decision")).toContainEqual(["Override of recommendation", "Yes"]);
    expect(get("PO discrepancy table").some((r) => r[0] === "Revision" && r[8] === "Blocker")).toBe(true);
    const csv = summaryCsv(s);
    expect(csv).toContain("Unit price · 1 → 2"); expect(csv).toContain("Total Cost 50%"); expect(csv).toContain("AI confidence: Unit price 95%"); expect(csv).toContain("Demo pre-extraction");
    for (const sec of s) for (const row of sec.rows) for (const cell of row) if (sec.title !== "Landed-cost composition" && sec.title !== "Scores and weight breakdown") expect(cell, `${sec.title}: ${cell}`).not.toMatch(KEY);
  });
  it("describes audit events with labels, not keys", () => {
    expect(describeAudit(createAuditEvent({ id: "x", timestamp: "t", action: "Field confirmed", field: "payment_terms_days", newValue: 60 }))).toBe("Payment terms (days) · Not provided → 60");
  });
});
