import { describe, it, expect } from "vitest";
import { mainSteps, progressSummary } from "./navigation";
import { workflowStages, type WorkflowStageState } from "./workflow-stages";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { newReference } from "./workflow";
import { bulkConfirmPlan } from "./bulk-confirm";

const initial: WorkflowStageState = { documents: [], extracting: false, comparisonComputed: false, recommendationExists: false, decisionApproved: false, hasPo: false, poChecked: false, poStatus: "Awaiting PO", configurationBlocked: false, revisionMonitoring: "Pending", investigationConfirmed: false };
const reference = { ...newReference(), rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", today: "2026-10-25", requiredDeliveryDate: "2027-03-15" };
const documents = confirmValidatedSamples(extendedSampleDocuments());
const validated = { ...initial, documents, comparisonComputed: compareDocuments(documents, reference, DEFAULT_WEIGHTS).length > 0, recommendationExists: true };
const status = (s: WorkflowStageState, valid = true) => mainSteps(workflowStages(s), valid).map((x) => x.status);

describe("six-step navigation", () => {
  it("starts with nothing complete", () => { expect(status(initial, false)).toEqual(["In progress", "Not started", "Not started", "Not started", "Not started", "Not started"]); });
  it("after validation completes quotes, validation and compare", () => { expect(status(validated)).toEqual(["Complete", "Complete", "Complete", "Complete", "In progress", "Not started"]); });
  it("after approval and release completes all six", () => { expect(status({ ...validated, decisionApproved: true, hasPo: true, poChecked: true, poStatus: "PO checked and released" })).toEqual(Array(6).fill("Complete")); });
  it("blocked PO marks PO & Release blocked", () => { expect(status({ ...validated, decisionApproved: true, hasPo: true, poChecked: true, poStatus: "PO blocked" })[5]).toBe("Blocked"); });
  it("never completes a later step while an earlier one is open", () => { expect(status(validated, false)).toEqual(["In progress", "In progress", "In progress", "In progress", "In progress", "Not started"]); });
  it("summarises position and next step", () => {
    const p = progressSummary(mainSteps(workflowStages(validated), true), 3, []);
    expect(p.position).toBe("Step 4 of 6"); expect(p.next).toMatch(/^Decision:/); expect(p.overall).toBe("In progress");
    expect(progressSummary(mainSteps(workflowStages(initial), true), 0, ["PO blocked"]).overall).toBe("Blocked");
  });
});
describe("bulk confirm preview", () => {
  it("never includes critical fields", () => {
    const docs = extendedSampleDocuments(); const plan = bulkConfirmPlan(docs, reference);
    for (const t of plan.targets) for (const f of t.fields) expect(["supplier_name", "part_number", "revision", "currency", "unit_price", "certifications"]).not.toContain(f);
    expect(plan.excluded).toContain("Supplier");
    expect(plan.fields).toBe(plan.targets.reduce((n, t) => n + t.fields.length, 0));
    expect(plan.criticalPending).toBeGreaterThan(0);
  });
});
