import { describe, expect, it } from "vitest";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import { createApprovedDecision } from "./recommendation";
import { buildApprovedPoContext } from "./po-check";
import { createPoFromApprovedDecision } from "./po-samples";
import { startPoDraft, transitionPo } from "./po-lifecycle";
import {
  currentSupplierConfirmation,
  recordSupplierConfirmation,
  supplierConfirmationAudit,
} from "./po-confirmation";
import { buildPoDocument } from "./po-document";
import { describeAudit } from "./audit-describe";
const time = "2026-10-25T12:00:00.000Z",
  actor = "Marina Costa (Demo buyer)";
const input = {
  confirmedOn: "2026-10-26",
  expectedDelivery: "2027-03-15",
  reference: "Supplier acknowledgement 123",
};
function fixture() {
  const rows = compareDocuments(sampleDocuments, sampleReference, DEFAULT_WEIGHTS);
  const supplier = rows.find((r) => r.name.includes("Atlas"));
  if (!supplier) throw new Error("Missing supplier");
  const decision = createApprovedDecision(
    rows,
    sampleReference,
    DEFAULT_WEIGHTS,
    supplier.document.id,
    "",
    time,
  );
  const context = buildApprovedPoContext(sampleReference, supplier, decision);
  const draft = startPoDraft(createPoFromApprovedDecision(context), time, actor);
  const issued = transitionPo(
    transitionPo(draft, "Generate", time, actor, true),
    "Issue",
    time,
    actor,
    true,
  );
  return { draft, issued, context };
}
describe("Supplier confirmation", () => {
  it("records acknowledgement and expected delivery without modifying the PO or release", () => {
    const { issued } = fixture();
    const next = recordSupplierConfirmation(issued, input, time, actor);
    expect(currentSupplierConfirmation(next)).toMatchObject({ ...input, timestamp: time, actor });
    expect(next.po).toEqual(issued.po);
    expect(next.lifecycle).toEqual(issued.lifecycle);
    expect(next.released).toBe(issued.released);
    expect(issued.supplierConfirmations).toBeUndefined();
  });
  it("requires an issued PO", () => {
    expect(() => recordSupplierConfirmation(fixture().draft, input, time, actor)).toThrow(
      "Issue the PO",
    );
  });
  it("rejects invalid confirmation dates", () => {
    expect(() =>
      recordSupplierConfirmation(
        fixture().issued,
        { ...input, confirmedOn: "2026-02-30" },
        time,
        actor,
      ),
    ).toThrow("valid date");
  });
  it("rejects invalid delivery dates", () => {
    expect(() =>
      recordSupplierConfirmation(
        fixture().issued,
        { ...input, expectedDelivery: "2027-02-30" },
        time,
        actor,
      ),
    ).toThrow("valid date");
  });
  it("confirmation cannot precede issue", () => {
    expect(() =>
      recordSupplierConfirmation(
        fixture().issued,
        { ...input, confirmedOn: "2026-10-24" },
        time,
        actor,
      ),
    ).toThrow("issue date");
  });
  it("delivery cannot precede confirmation", () => {
    expect(() =>
      recordSupplierConfirmation(
        fixture().issued,
        { ...input, expectedDelivery: "2026-10-25" },
        time,
        actor,
      ),
    ).toThrow("precede supplier confirmation");
  });
  it("cancelled POs reject new acknowledgements", () => {
    const state = transitionPo(fixture().issued, "Cancel", time, actor, true);
    expect(() => recordSupplierConfirmation(state, input, time, actor)).toThrow("Issue the PO");
  });
  it("updates retain old values, audit descriptions and saved records", () => {
    const first = recordSupplierConfirmation(fixture().issued, input, time, actor);
    const next = recordSupplierConfirmation(
      first,
      { ...input, expectedDelivery: "2027-03-20" },
      time,
      actor,
    );
    expect(next.supplierConfirmations).toHaveLength(2);
    expect(currentSupplierConfirmation(JSON.parse(JSON.stringify(next)))?.expectedDelivery).toBe(
      "2027-03-20",
    );
    const audit = supplierConfirmationAudit(first, next);
    expect(audit.previousValue).toContain("2027-03-15");
    expect(audit.newValue).toContain("2027-03-20");
    expect(describeAudit({ ...audit, id: "1", timestamp: time, actor })).toContain(
      "Supplier acknowledgement 123",
    );
  });
  it("amendments preserve old acknowledgement but never inherit it", () => {
    const { issued, context } = fixture();
    const first = recordSupplierConfirmation(issued, input, time, actor);
    const amendment = transitionPo(first, "Amend", time, actor, true);
    expect(currentSupplierConfirmation(amendment)).toBeUndefined();
    expect(currentSupplierConfirmation(amendment, issued.po)?.expectedDelivery).toBe("2027-03-15");
    expect(
      buildPoDocument(first, context)?.sections.find((s) => s.title === "Supplier confirmation")
        ?.rows,
    ).toContainEqual(["Expected delivery date", "2027-03-15"]);
  });
  it("legacy snapshots remain readable with no invented confirmation", () => {
    expect(currentSupplierConfirmation(fixture().issued)).toBeUndefined();
  });
});
