import { describe, it, expect } from "vitest";
import { auditActor, DEMO_AUDIT_ACTOR, identityLabel } from "./identity";
import { createAuditEvent } from "./audit";
import { buildTimeline } from "./audit-timeline";
import { buildDecisionSummary, summaryCsv } from "./decision-summary";
import { createApprovedDecision } from "./recommendation";
import { resolvePoItem, buildApprovedPoContext, loadAndCheckPo, DEFAULT_PO_TOLERANCES } from "./po-check";
import { demoPurchaseOrder } from "./po-samples";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { newReference } from "./workflow";

const ref = { ...newReference(), today: "2026-10-25", demoAnalysis: true, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, requiredDeliveryDate: "2027-03-15", incumbentSupplier: "Meridian Flight Components LLC" };
const docs = confirmValidatedSamples(extendedSampleDocuments()).slice(0, 4);
const list = compareDocuments(docs, ref, DEFAULT_WEIGHTS);

describe("audit actor", () => {
  it("signed out: fictional demo buyer, clearly marked", () => {
    expect(auditActor(null)).toBe("Marina Costa (Demo buyer)");
    expect(auditActor({ email: "", name: "  " })).toBe(DEMO_AUDIT_ACTOR);
  });
  it("signed in: display name, else email, never an internal id", () => {
    expect(auditActor({ name: "Stephany Alves", email: "s@example.com" })).toBe("Stephany Alves");
    expect(auditActor({ name: null, email: "s@example.com" })).toBe("s@example.com");
    const withId = { id: "9f1c2b7e-0000-4000-8000-000000000000", email: "s@example.com", name: null };
    expect(auditActor(withId)).not.toContain(withId.id);
  });
  it("header identity: name for signed-in users, Demo mode otherwise", () => {
    expect(identityLabel({ name: "Stephany Alves", email: "s@example.com" }).primary).toBe("Stephany Alves");
    expect(identityLabel(null).primary).toBe("Demo mode");
  });
  it("decision and PO resolutions carry the supplied actor", () => {
    const rec = list.find((a) => a.eligible)!;
    const d = createApprovedDecision(list, ref, DEFAULT_WEIGHTS, rec.document.id, "", "t", "s@example.com");
    expect(d.actor).toBe("s@example.com");
    expect(createApprovedDecision(list, ref, DEFAULT_WEIGHTS, rec.document.id, "", "t").actor).toBe(DEMO_AUDIT_ACTOR);
    const ctx = buildApprovedPoContext(ref, rec, d);
    const st = loadAndCheckPo(demoPurchaseOrder(ctx, "Blocked PO"), ctx, DEFAULT_PO_TOLERANCES);
    const item = st.result!.items.find((i) => i.status === "blocker")!;
    expect(resolvePoItem(st.result!, [], item.id, "correction_requested", "Fix", "t", "Stephany Alves")[0]!.actor).toBe("Stephany Alves");
  });
  it("mixed timeline keeps each event's recorded actor in timeline and exports", () => {
    const before = createAuditEvent({ id: "1", timestamp: "2026-10-25T12:00:00.000Z", action: "Quotation confirmed", documentId: docs[0]!.id }, auditActor(null));
    const after = createAuditEvent({ id: "2", timestamp: "2026-10-25T12:05:00.000Z", action: "Quotation confirmed", documentId: docs[1]!.id }, auditActor({ name: "Stephany Alves", email: "s@example.com" }));
    const timeline = buildTimeline({ registry: [], snapshots: [], audit: [before, after], assessments: [], failures: [], investigations: [], supplierOf: () => "Supplier", partNumber: "PN-45Y1258" });
    expect(timeline.map((e) => e.actor)).toEqual(["Marina Costa (Demo buyer)", "Stephany Alves"]);
    const csv = summaryCsv(buildDecisionSummary({ reference: ref, documents: docs, list, weights: DEFAULT_WEIGHTS, snapshots: [], timeline }));
    expect(csv).toContain("Marina Costa (Demo buyer)");
    expect(csv).toContain("Stephany Alves");
  });
});
