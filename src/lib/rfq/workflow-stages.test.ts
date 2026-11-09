import { describe, expect, it } from "vitest";
import { workflowStages, type WorkflowStageState } from "./workflow-stages";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, decisionInsights, DEFAULT_WEIGHTS } from "./intelligence";
import { newReference } from "./workflow";

const initial: WorkflowStageState = {
  documents: [], extracting: false, comparisonComputed: false, recommendationExists: false,
  decisionApproved: false, hasPo: false, poChecked: false, poStatus: "Awaiting PO",
  configurationBlocked: false, revisionMonitoring: "Pending", investigationConfirmed: false,
};
const documents = confirmValidatedSamples(extendedSampleDocuments());
const reference = { ...newReference(), rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", today: "2026-10-25", requiredDeliveryDate: "2027-03-15" };
const results = compareDocuments(documents, reference, DEFAULT_WEIGHTS);
const validated = { ...initial, documents, comparisonComputed: results.length > 0, recommendationExists: Boolean(decisionInsights(results, reference).recommended) };
const approved = { ...validated, decisionApproved: true };
const released = { ...approved, hasPo: true, poChecked: true, poStatus: "PO checked and released", revisionMonitoring: "Confirmed" as const };
const statuses = (state: WorkflowStageState) => workflowStages(state).map((s) => s.status);

describe("Workflow stage evidence", () => {
  it("starts with all eleven stages pending", () => {
    expect(statuses(initial)).toEqual(Array(11).fill("Pending"));
  });
  it("requires review after loading pre-extracted samples", () => {
    expect(statuses({ ...initial, documents: extendedSampleDocuments() }).slice(0, 6)).toEqual(["Received", "Extracted", "In review", "Pending", "Pending", "Pending"]);
  });
  it("confirms review, calculation and recommendation after validation, excluding held quotes", () => {
    expect(documents.filter((d) => d.excluded)).toHaveLength(4);
    expect(results).toHaveLength(16);
    expect(statuses(validated)).toEqual(["Received", "Extracted", "Confirmed", "Confirmed", "Confirmed", "Pending", "Pending", "Pending", "Pending", "Pending", "Pending"]);
  });
  it("confirms decision approval without resetting earlier completed stages", () => {
    expect(statuses(approved)).toEqual(["Received", "Extracted", "Confirmed", "Confirmed", "Confirmed", "Confirmed", "Available", "Pending", "Pending", "Pending", "Pending"]);
  });
  it("keeps prerequisite stages complete after PO release", () => {
    expect(statuses(released)).toEqual(["Received", "Extracted", "Confirmed", "Confirmed", "Confirmed", "Confirmed", "Received", "Confirmed", "Confirmed", "Confirmed", "In review"]);
  });
  it("does not infer calculation or recommendation solely from confirmed documents", () => {
    expect(statuses({ ...initial, documents }).slice(2, 6)).toEqual(["Confirmed", "Pending", "Pending", "Pending"]);
  });
  it("removes downstream confirmations when a compared quotation loses confirmation", () => {
    const edited = documents.map((d) => d.id === "sample-11" ? { ...d, confirmed: false } : d);
    expect(statuses({ ...released, documents: edited }).slice(2)).not.toContain("Confirmed");
  });
  it("does not complete later stages from stale downstream evidence with no quotations", () => {
    expect(statuses({ ...released, documents: [], investigationConfirmed: true })).toEqual(Array(11).fill("Pending"));
  });
  it("keeps release and monitoring pending for unresolved PO discrepancies", () => {
    expect(statuses({ ...released, poStatus: "PO with discrepancies" }).slice(7)).toEqual(["In review", "Pending", "Pending", "Pending"]);
  });
  it("blocks release for configuration blockers and suppresses later confirmations", () => {
    expect(statuses({ ...released, configurationBlocked: true }).slice(8)).toEqual(["Blocked", "Pending", "Pending"]);
  });
  it("does not confirm investigation before revision monitoring completes", () => {
    expect(statuses({ ...released, revisionMonitoring: "In review", investigationConfirmed: true }).slice(9)).toEqual(["In review", "Pending"]);
  });
  it.each([initial, validated, approved, released])("never confirms a stage after a pending prerequisite", (state) => {
    const stages = statuses(state);
    stages.forEach((status, index) => {
      if (status === "Confirmed") expect(stages.slice(0, index)).not.toContain("Pending");
    });
  });
});