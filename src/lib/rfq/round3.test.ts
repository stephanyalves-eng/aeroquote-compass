import { describe, it, expect } from "vitest";
import { defaultScenario, simulateScenario } from "./scenarios";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import { DEFAULT_WEIGHTS, compareDocuments, decisionInsights } from "./intelligence";
import { revisionDiff } from "./revision-diff";
import {
  createSnapshot,
  demoRevisionRegistry,
  publishRevision,
  detectRevisionChanges,
  createImpactAssessment,
} from "./revisions";
import { operationalSummary, savedOperationalSummary } from "./operations";
import { emptyPoState, buildApprovedPoContext, loadAndCheckPo, resolvePoItem } from "./po-check";
import { demoPurchaseOrder } from "./po-samples";
import { createApprovedDecision } from "./recommendation";
const settings = defaultScenario(sampleReference, DEFAULT_WEIGHTS);
const baseline = compareDocuments(sampleDocuments, sampleReference, DEFAULT_WEIGHTS);
const atlas = baseline.find((a) => a.name === "Atlas Controls INC");
if (!atlas) throw new Error("Missing Atlas");
const decision = createApprovedDecision(
  baseline,
  sampleReference,
  DEFAULT_WEIGHTS,
  atlas.document.id,
  "",
  "2026-10-25",
);
const context = buildApprovedPoContext(sampleReference, atlas, decision);

describe("isolated scenario calculations", () => {
  it("defaults reproduce every original cost, score and Atlas recommendation exactly", () => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, settings);
    expect(result.errors).toEqual([]);
    expect(result.recommended?.name).toBe("Atlas Controls INC");
    expect(result.recommended?.annualLanded).toBe(230256);
    for (const row of result.rows) {
      expect(row.supplier.annualLanded).toBe(row.originalCost);
      expect(row.supplier.score).toBe(row.originalScore);
    }
  });
  it("uses the 24-unit Atlas price break and reconciles scenario components", () => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      annualVolume: 24,
    });
    expect(
      result.rows.find((r) => r.supplier.name.startsWith("Atlas"))?.supplier.annualLanded,
    ).toBe(446784);
    for (const row of result.rows)
      expect(row.breakdown.components.reduce((n, c) => n + c.amountUsd, 0)).toBeCloseTo(
        row.supplier.annualLanded ?? 0,
        6,
      );
  });
  it("replaces freight/combined estimate, retains Meridian insurance and avoids double counting", () => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      freightUsd: 1000,
    });
    expect(
      result.rows.find((r) => r.supplier.name.startsWith("Atlas"))?.supplier.annualLanded,
    ).toBe(222400);
    const meridian = result.rows.find((r) => r.supplier.name.startsWith("Meridian"));
    expect(meridian?.supplier.annualLanded).toBe(214800);
    expect(meridian?.supplier.insurance).toBe(3000);
    expect(meridian?.supplier.combinedEstimate).toBeNull();
  });
  it("allocates only explicit NRE over four years, leaves tooling/FAI and source data unchanged", () => {
    const before = JSON.stringify({ sampleDocuments, sampleReference, decision });
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      nreYears: 4,
    });
    expect(
      result.rows.find((r) => r.supplier.name.startsWith("Meridian"))?.supplier.annualLanded,
    ).toBe(231800);
    expect(
      result.rows
        .find((r) => r.supplier.name.startsWith("Meridian"))
        ?.breakdown.components.find((c) => c.label === "NRE")?.treatment,
    ).toBe("amortized");
    expect(result.rows.find((r) => r.supplier.name.startsWith("Polar"))?.supplier.oneTime).toBe(
      6500,
    );
    expect(result.rows.find((r) => r.supplier.name.startsWith("Helix"))?.supplier.oneTime).toBe(
      baseline.find((a) => a.name.startsWith("Helix"))?.oneTime,
    );
    expect(JSON.stringify({ sampleDocuments, sampleReference, decision })).toBe(before);
  });
  it("converts EUR using scenario FX while never recommending expired Helix or wrong-revision Polar", () => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      usdBrl: 5,
      eurBrl: 6,
    });
    expect(
      result.rows.find((r) => r.supplier.name.startsWith("Helix"))?.supplier.annualLanded,
    ).toBeCloseTo(238080, 6);
    expect(result.rows.filter((r) => !r.supplier.eligible).map((r) => r.supplier.name)).toContain(
      "Helix Precision SA",
    );
    expect(result.recommended?.eligible).toBe(true);
  });
  it("reports a data-based recommendation change under 100% risk weight", () => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      weights: { cost: 0, leadTime: 0, risk: 100, payment: 0, compliance: 0, commercial: 0 },
    });
    expect(result.recommended?.name).toBe("Meridian Flight Components LLC");
    expect(result.changed).toBe(true);
    expect(result.explanation).toContain("Supplier Risk: +50.0 weighted points");
    expect(decisionInsights(baseline, sampleReference).recommended?.name).toBe(
      "Atlas Controls INC",
    );
  });
  it.each([
    { annualVolume: 0 },
    { annualVolume: 1.5 },
    { usdBrl: 0 },
    { eurBrl: NaN },
    { freightUsd: -1 },
    { nreYears: 0 },
    { nreYears: 1.5 },
  ])("rejects invalid inputs without a scenario recommendation: %o", (patch) => {
    const result = simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
      ...settings,
      ...patch,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.recommended).toBeNull();
    expect(result.rows).toEqual([]);
  });
  it("rejects unconfirmed quotations and invalid score weights", () => {
    expect(
      simulateScenario(
        sampleDocuments.map((d) => ({ ...d, confirmed: false })),
        sampleReference,
        DEFAULT_WEIGHTS,
        settings,
      ).errors,
    ).toContain("Buyer confirmation is required before scenario analysis.");
    expect(
      simulateScenario(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, {
        ...settings,
        weights: { ...DEFAULT_WEIGHTS, cost: 41 },
      }).recommended,
    ).toBeNull();
  });
});

const registry = demoRevisionRegistry();
const snapshot = createSnapshot(registry, {
  id: "check-1",
  at: "2026-10-25",
  timestamp: "2026-10-25T12:00:00Z",
  checkType: "PO verification",
  actor: "Demo buyer",
  supplier: "Atlas Controls INC",
  partNumber: "PN-45Y1258",
  quoteRevision: "C",
  foundRevision: "C",
  sourceDocuments: ["DWG-45210", "ES-1180"],
  result: "Confirmed",
  divergences: [],
  tolerances: null,
  justifications: [],
  finalStatus: "Confirmed",
  poNumber: "PO-DEMO-1",
});
const nextRegistry = publishRevision(registry, {
  kind: "drawing",
  documentNumber: "DWG-45210",
  revision: "D",
  effectiveFrom: "2026-11-15",
  owner: "Demo engineer",
  changeReason: "Port thread changed to MJ12.",
});
const alerts = detectRevisionChanges(nextRegistry, [snapshot], "2026-11-15");
describe("recorded revision diff", () => {
  it("shows C → D changes, affected documents and PO checks without rewriting snapshots", () => {
    const alert = alerts[0];
    if (!alert) throw new Error("No alert");
    const diff = revisionDiff(nextRegistry, [snapshot], alert, []);
    expect(diff.fields.find((f) => f.label === "Revision")).toEqual({
      label: "Revision",
      previous: "C",
      next: "D",
    });
    expect(diff.fields.find((f) => f.label === "Engineering change reason")?.next).toBe(
      "Port thread changed to MJ12.",
    );
    expect(diff.documents).toEqual(["DWG-45210", "ES-1180"]);
    expect(diff.checks[0]).toMatchObject({
      label: "PO verification",
      previous: "C",
      next: "D",
      po: "PO-DEMO-1",
    });
    expect(snapshot.drawingRevision).toBe("C");
    expect(diff.impact).toBe("Not yet assessed");
  });
  it("shows actual assessment and missing registry values rather than invented content", () => {
    const alert = alerts[0];
    if (!alert) throw new Error("No alert");
    const assessment = createImpactAssessment(
      alert,
      "Blocks release",
      "Thread compatibility requires engineering review.",
      "Demo buyer",
      "2026-11-15T12:00:00Z",
    );
    const diff = revisionDiff(
      nextRegistry.filter((r) => r.revision !== "C"),
      [snapshot],
      alert,
      [assessment],
    );
    expect(diff.fields.find((f) => f.label === "Revision")?.previous).toBe("Not provided");
    expect(diff.impact).toBe("Blocks release");
    expect(diff.justification).toBe(assessment.justification);
  });
});
describe("operational evidence summaries", () => {
  it("saved RFQ summaries retain new-revision blocks even when the demo analysis date is earlier", () => {
    const poState = loadAndCheckPo(
      demoPurchaseOrder(context, "Correct PO"),
      context,
      emptyPoState().tolerances,
    );
    const items = savedOperationalSummary(
      {
        reference: { ...sampleReference, demoAnalysis: true },
        documents: sampleDocuments,
        poState,
        approvedDecision: decision,
        configuration: { registry: nextRegistry, snapshots: [snapshot], assessments: [] },
      },
      "2026-11-09",
    );
    expect(items.find((i) => i.id === "revisions")?.count).toBe(1);
    expect(items.find((i) => i.id === "po")?.count).toBe(1);
  });
  it("counts only pending included quotes and expiring (not expired) quotations", () => {
    const items = operationalSummary({ reference: sampleReference, documents: sampleDocuments });
    expect(items.find((i) => i.id === "attention")?.count).toBe(0);
    expect(items.find((i) => i.id === "expiring")?.count).toBe(2);
    expect(
      operationalSummary({
        reference: sampleReference,
        documents: sampleDocuments.map((d) => ({ ...d, confirmed: false, excluded: true })),
      }).find((i) => i.id === "attention")?.count,
    ).toBe(0);
  });
  it("detects critical PO and configuration blocks without calling unresolved tolerable discrepancies blockers", () => {
    const clean = loadAndCheckPo(
      demoPurchaseOrder(context, "Correct PO"),
      context,
      emptyPoState().tolerances,
    );
    const blocked = loadAndCheckPo(
      demoPurchaseOrder(context, "Blocked PO"),
      context,
      emptyPoState().tolerances,
    );
    const input = { reference: sampleReference, documents: sampleDocuments, approved: true };
    expect(operationalSummary({ ...input, poState: clean }).find((i) => i.id === "po")?.count).toBe(
      0,
    );
    expect(
      operationalSummary({ ...input, poState: blocked }).find((i) => i.id === "po")?.count,
    ).toBe(1);
    expect(
      operationalSummary({ ...input, poState: clean, configurationBlocked: true }).find(
        (i) => i.id === "po",
      )?.count,
    ).toBe(1);
    let review = loadAndCheckPo(
      demoPurchaseOrder(context, "Non-critical discrepancy"),
      context,
      emptyPoState().tolerances,
    );
    const result = review.result;
    if (!result) throw new Error("No result");
    for (const i of result.items.filter((i) => i.status === "requires_review"))
      review = {
        ...review,
        resolutions: resolvePoItem(
          result,
          review.resolutions,
          i.id,
          "accepted",
          "Reviewed demo discrepancy.",
          "2026-10-25",
        ),
      };
    expect(
      operationalSummary({ ...input, poState: review }).find((i) => i.id === "po")?.count,
    ).toBe(0);
  });
  it("uses unresolved revision assessments and confirmed investigation evidence", () => {
    const alert = alerts[0];
    if (!alert) throw new Error("No alert");
    const input = { reference: sampleReference, documents: sampleDocuments, alerts };
    expect(operationalSummary(input).find((i) => i.id === "revisions")?.count).toBe(1);
    expect(
      operationalSummary({
        ...input,
        assessments: [
          createImpactAssessment(
            alert,
            "No known impact",
            "Reviewed engineering change.",
            "Demo buyer",
            "2026-11-15",
          ),
        ],
      }).find((i) => i.id === "revisions")?.count,
    ).toBe(0);
    const investigation = {
      failureId: "CASE-DEMO-1",
      suggested: "Insufficient evidence" as const,
      evidence: [],
      revisionAtManufacture: null,
      confirmed: null,
      confirmedBy: null,
      note: "",
    };
    expect(
      operationalSummary({ ...input, investigations: [investigation] }).find(
        (i) => i.id === "investigations",
      )?.count,
    ).toBe(1);
    expect(
      operationalSummary({
        ...input,
        investigations: [{ ...investigation, confirmed: "Insufficient evidence" }],
      }).find((i) => i.id === "investigations")?.count,
    ).toBe(0);
  });
});
