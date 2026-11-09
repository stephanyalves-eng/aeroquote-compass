import { describe, it, expect } from "vitest";
import { erpProcessSteps, ERP_NAV, ERP_NAV_GROUPS, DASHBOARD_STEP, type ErpProcessInput } from "./erp-nav";
import { buildSearchEntries, globalSearch } from "./search";
import { requiresAttention } from "./operations";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { analysisDateFor, newReference } from "./workflow";
import { emptyPoState } from "./po-check";
import { demoRevisionRegistry, detectRevisionChanges, publishRevision, createSnapshot, DEMO_DRAWING } from "./revisions";
import { demoPurchaseOrder } from "./po-samples";
import { compareDocuments, DEFAULT_WEIGHTS, decisionInsights } from "./intelligence";
import { createApprovedDecision } from "./recommendation";
import { buildApprovedPoContext, loadAndCheckPo } from "./po-check";
import { demoInvestigationCases } from "./investigation-demo";
import { investigateFailure } from "./investigation";

const reference = { ...newReference(), ...analysisDateFor(true), rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, description: "Hydraulic actuator Y8", requiredDeliveryDate: "2027-03-15" };
const confirmedDocs = () => confirmValidatedSamples(extendedSampleDocuments());

const baseInput = (over: Partial<ErpProcessInput> = {}): ErpProcessInput => ({
  setupValid: true,
  documents: [],
  extracting: false,
  comparisonComputed: false,
  decisionApproved: false,
  hasPo: false,
  poChecked: false,
  poStatus: "Awaiting PO",
  configurationBlocked: false,
  ...over,
});

describe("ERP sidebar navigation", () => {
  it("lists dashboard, operational, decision and traceability destinations", () => {
    const labels = ERP_NAV.map((i) => i.label);
    for (const expected of ["Dashboard", "RFQ Setup", "Quotations", "Buyer Validation", "Supplier Comparison", "Decisions", "Purchase Orders", "Release Control", "Configuration", "Audit Trail", "Investigations"])
      expect(labels).toContain(expected);
    expect(ERP_NAV.find((i) => i.id === "dashboard")?.step).toBe(DASHBOARD_STEP);
    for (const group of ERP_NAV_GROUPS) expect(ERP_NAV.some((i) => i.group === group)).toBe(true);
  });
});

describe("erpProcessSteps", () => {
  it("starts with only RFQ creation in progress", () => {
    const steps = erpProcessSteps(baseInput({ setupValid: false }));
    expect(steps.map((s) => s.label)).toEqual(["RFQ created", "Quotes received", "Buyer validation", "Comparison complete", "Decision approved", "PO issued", "PO verified", "Released"]);
    expect(steps[0]!.status).toBe("In progress");
    expect(steps.slice(1).every((s) => s.status === "Not started")).toBe(true);
  });
  it("marks buyer validation as requiring attention while confirmations are pending", () => {
    const steps = erpProcessSteps(baseInput({ documents: extendedSampleDocuments() }));
    expect(steps[1]!.status).toBe("Completed");
    expect(steps[2]!.status).toBe("Requires attention");
    expect(steps[3]!.status).toBe("Not started");
  });
  it("completes validation and comparison after confirmation", () => {
    const steps = erpProcessSteps(baseInput({ documents: confirmedDocs(), comparisonComputed: true }));
    expect(steps[2]!.status).toBe("Completed");
    expect(steps[3]!.status).toBe("Completed");
    expect(steps[4]!.status).toBe("In progress");
  });
  it("blocks PO verification on critical discrepancies and never completes a later step first", () => {
    const steps = erpProcessSteps(baseInput({ documents: confirmedDocs(), comparisonComputed: true, decisionApproved: true, hasPo: true, poChecked: true, poStatus: "PO blocked" }));
    expect(steps[5]!.status).toBe("Completed");
    expect(steps[6]!.status).toBe("Blocked");
    expect(steps[7]!.status).toBe("Not started");
  });
  it("blocks release when the configuration gate is unresolved", () => {
    const steps = erpProcessSteps(baseInput({ documents: confirmedDocs(), comparisonComputed: true, decisionApproved: true, hasPo: true, poChecked: true, poStatus: "PO checked, awaiting release", configurationBlocked: true }));
    expect(steps[6]!.status).toBe("Completed");
    expect(steps[7]!.status).toBe("Blocked");
  });
  it("completes the whole flow after release", () => {
    const steps = erpProcessSteps(baseInput({ documents: confirmedDocs(), comparisonComputed: true, decisionApproved: true, hasPo: true, poChecked: true, poStatus: "PO checked and released" }));
    expect(steps.every((s) => s.status === "Completed")).toBe(true);
  });
});

describe("global search", () => {
  const docs = confirmedDocs();
  const registry = demoRevisionRegistry();
  const entries = buildSearchEntries({ reference, documents: docs, registry });
  it("indexes RFQ, part number, suppliers, quotes, drawing and revisions", () => {
    const kinds = new Set(entries.map((e) => e.kind));
    for (const k of ["RFQ", "Part number", "Supplier", "Quote", "Drawing", "Revision"]) expect(kinds.has(k as never)).toBe(true);
    expect(entries.some((e) => e.label === "RFQ-24410")).toBe(true);
    expect(entries.some((e) => e.label === "PN-45Y1258")).toBe(true);
  });
  it("finds suppliers case-insensitively and ranks prefix matches first", () => {
    const hits = globalSearch(entries, "horizon");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.kind).toBe("Supplier");
    expect(hits[0]!.label.toLowerCase()).toContain("horizon");
  });
  it("finds PO numbers and revisions", () => {
    const withPo = buildSearchEntries({ reference, documents: docs, registry, poState: { ...emptyPoState(), po: { poNumber: "PO-90011", supplier: "Horizon" } as never } });
    expect(globalSearch(withPo, "PO-90011")[0]?.kind).toBe("PO");
    expect(globalSearch(entries, "rev c").some((e) => e.kind === "Revision")).toBe(true);
  });
  it("returns nothing for empty queries and limits results", () => {
    expect(globalSearch(entries, "   ")).toEqual([]);
    expect(globalSearch(entries, "quote", 5).length).toBeLessThanOrEqual(5);
  });
});

describe("requiresAttention", () => {
  const docs = confirmedDocs();
  it("has no critical or high items for a clean approved flow", () => {
    const items = requiresAttention({ reference, documents: docs, approved: true, alerts: [], assessments: [], investigations: [] });
    expect(items.every((i) => i.severity === "Medium")).toBe(true);
  });
  it("lists pending validations with owner and next action", () => {
    const pending = extendedSampleDocuments();
    const items = requiresAttention({ reference, documents: pending });
    const validation = items.find((i) => i.id === "validation");
    expect(validation?.severity).toBe("High");
    expect(validation?.owner).toContain("Demo buyer");
    expect(validation?.nextAction).toBe("Validate quotations");
    expect(validation?.step).toBe(2);
  });
  it("flags a missing decision once the comparison is ready", () => {
    const items = requiresAttention({ reference, documents: docs, approved: false });
    expect(items.some((i) => i.id === "decision" && i.step === 4)).toBe(true);
  });
  it("ranks a blocked PO as critical before other items", () => {
    const results = compareDocuments(docs, reference, DEFAULT_WEIGHTS);
    const recommended = decisionInsights(results, reference).recommended!;
    const decision = createApprovedDecision(results, reference, DEFAULT_WEIGHTS, recommended.document.id, "", "2026-10-25T12:00:00.000Z");
    const context = buildApprovedPoContext(reference, results.find((a) => a.document.id === decision.supplierId)!, decision);
    const po = demoPurchaseOrder(context, "Wrong supplier");
    const poState = loadAndCheckPo(po, context, emptyPoState().tolerances);
    const items = requiresAttention({ reference, documents: docs, poState, approved: true });
    expect(items[0]!.id).toBe("po-blocked");
    expect(items[0]!.severity).toBe("Critical");
    expect(items[0]!.due).toBe("2027-03-15");
  });
  it("lists unresolved revision alerts and open investigations", () => {
    const registry = demoRevisionRegistry();
    const snapshot = createSnapshot(registry, { id: "s1", at: "2026-10-25", timestamp: "2026-10-25T12:00:00.000Z", checkType: "PO verification", actor: "demo", supplier: "Atlas", partNumber: "PN-45Y1258", quoteRevision: "C", foundRevision: "C", sourceDocuments: [], result: "Confirmed", divergences: [], tolerances: null, justifications: [], finalStatus: "ok", poNumber: null });
    const nextRegistry = publishRevision(registry, { kind: "drawing", documentNumber: DEMO_DRAWING, revision: "D", effectiveFrom: "2026-11-15", owner: "Rafael Lima (Demo engineer)", changeReason: "Test" });
    const alerts = detectRevisionChanges(nextRegistry, [snapshot], "2026-11-16");
    const cases = demoInvestigationCases();
    const investigations = [investigateFailure(cases[0]!.failure, cases[0]!.snapshots, cases[0]!.registry, cases[0]!.manufacturedOn)];
    const items = requiresAttention({ reference, documents: docs, approved: true, alerts, assessments: [], investigations });
    expect(items.some((i) => i.process === "Configuration" && i.step === 6)).toBe(true);
    expect(items.some((i) => i.process === "Investigation" && i.step === 8)).toBe(true);
  });
  it("sorts by severity then due date", () => {
    const pending = extendedSampleDocuments();
    const items = requiresAttention({ reference, documents: pending });
    for (let i = 1; i < items.length; i++) {
      const order = { Critical: 0, High: 1, Medium: 2 } as const;
      expect(order[items[i]!.severity]).toBeGreaterThanOrEqual(order[items[i - 1]!.severity]);
    }
  });
});
