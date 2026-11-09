import { describe, expect, it } from "vitest";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { createApprovedDecision } from "./recommendation";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import {
  buildApprovedPoContext,
  checkPurchaseOrder,
  loadAndCheckPo,
  resolvePoItem,
} from "./po-check";
import { createPoFromApprovedDecision, demoPurchaseOrder } from "./po-samples";
import {
  draftErrors,
  draftEditAudit,
  lifecycleAudit,
  lifecycleStatus,
  poEditingAllowed,
  poReleaseAllowed,
  savePoDraft,
  startPoDraft,
  transitionPo,
} from "./po-lifecycle";
import { buildPoDocument, poProvenance } from "./po-document";
import { filterPoList, poListRows, poListCsv } from "./po-list";
import { describeAudit } from "./audit-describe";
import { erpProcessSteps } from "./erp-nav";
const time = "2026-10-25T12:00:00.000Z",
  actor = "Marina Costa (Demo buyer)";
function fixture() {
  const list = compareDocuments(sampleDocuments, sampleReference, DEFAULT_WEIGHTS);
  const supplier = list.find((a) => a.name.includes("Atlas"));
  if (!supplier) throw new Error("Missing Atlas fixture");
  const decision = createApprovedDecision(
    list,
    sampleReference,
    DEFAULT_WEIGHTS,
    supplier.document.id,
    "",
    time,
  );
  const context = buildApprovedPoContext(sampleReference, supplier, decision);
  const draft = startPoDraft(createPoFromApprovedDecision(context), time, actor);
  return { context, draft };
}
function issued() {
  const { context, draft } = fixture();
  return {
    context,
    state: transitionPo(
      transitionPo(draft, "Generate", time, actor, true),
      "Issue",
      time,
      actor,
      true,
    ),
  };
}
describe("PO lifecycle safeguards", () => {
  it("follows saved draft → generated → issued → verified → awaiting release → released", () => {
    const { context, draft } = fixture();
    expect(lifecycleStatus(draft)).toBe("Draft");
    const generated = transitionPo(draft, "Generate", time, actor, true);
    expect(lifecycleStatus(generated)).toBe("Generated");
    const issued = transitionPo(generated, "Issue", time, actor, true);
    expect(lifecycleStatus(issued)).toBe("Issued");
    expect(poEditingAllowed(issued)).toBe(false);
    const checking = transitionPo(issued, "Verify", time, actor, true);
    expect(lifecycleStatus(checking)).toBe("Awaiting verification");
    const checked = {
      ...checking,
      result: checkPurchaseOrder(checking.po ?? context.expected, context),
    };
    expect(poReleaseAllowed(checked, true, false)).toBe(false);
    const verified = transitionPo(checked, "Confirm verification", time, actor, true);
    expect(lifecycleStatus(verified)).toBe("Verified");
    const ready = transitionPo(verified, "Prepare release", time, actor, true);
    expect(poReleaseAllowed(ready, true, false)).toBe(true);
    const released = transitionPo(ready, "Release", time, actor, true);
    expect(lifecycleStatus(released)).toBe("Released");
  });
  it("rejects issue before generation and release without issue, approval or completed checks", () => {
    const { draft } = fixture();
    expect(() => transitionPo(draft, "Issue", time, actor, true)).toThrow("Generate");
    expect(() => transitionPo(draft, "Release", time, actor, true)).toThrow();
    expect(() => transitionPo(draft, "Generate", time, actor, false)).toThrow("approved decision");
  });
  it("validates required fields, dates, currency and positive amounts without inventing charges", () => {
    const { draft } = fixture();
    if (!draft.po) throw new Error("PO required");
    expect(
      draftErrors({
        ...draft.po,
        poNumber: "",
        quantity: 0,
        currency: null,
        issueDate: "2026-02-30",
      }),
    ).toEqual(
      expect.arrayContaining([
        "PO number is required.",
        "Quantity (units) must be positive.",
        "Currency is required.",
        "PO issue date must be a valid date.",
      ]),
    );
    expect(draftErrors(draft.po)).toEqual([]);
    expect(draft.po.freight).toBeNull();
  });
  it("prevents edits after generation and preserves the issued document after amendment", () => {
    const { state } = issued();
    if (!state.po) throw new Error("PO required");
    const po = state.po;
    expect(() => savePoDraft(state, { ...po, unitPrice: 1 }, time, actor)).toThrow("amendment");
    const before = JSON.stringify(state);
    const amended = transitionPo(state, "Amend", time, actor, true);
    expect(lifecycleStatus(amended)).toBe("Draft");
    expect(amended.lifecycle?.revision).toBe(2);
    expect(amended.po?.poNumber).toMatch(/-R2$/);
    expect(amended.lifecycle?.history[0]?.status).toBe("Superseded");
    expect(amended.lifecycle?.history[0]?.po.unitPrice).toBe(18450);
    expect(JSON.stringify(state)).toBe(before);
    expect(amended.result).toBeUndefined();
    expect(amended.resolutions).toEqual([]);
    expect(amended.released).toBe(false);
  });
  it("cancelled PO cannot verify or release; released PO cannot cancel", () => {
    const { context, state } = issued();
    const cancelled = transitionPo(state, "Cancel", time, actor, true);
    expect(lifecycleStatus(cancelled)).toBe("Cancelled");
    expect(poReleaseAllowed(cancelled, true, false)).toBe(false);
    expect(() => transitionPo(cancelled, "Verify", time, actor, true)).toThrow("Cancelled");
    const ready = {
      ...state,
      lifecycle: state.lifecycle
        ? { ...state.lifecycle, phase: "Awaiting release" as const }
        : undefined,
      result: checkPurchaseOrder(state.po ?? context.expected, context),
    };
    const released = transitionPo(ready, "Release", time, actor, true);
    expect(() => transitionPo(released, "Cancel", time, actor, true)).toThrow("Released");
  });
  it("blockers and configuration gates prohibit verification and release", () => {
    const { context, state } = issued();
    const po = demoPurchaseOrder(context, "Wrong supplier");
    const blocked = { ...state, po, result: checkPurchaseOrder(po, context) };
    expect(lifecycleStatus(blocked)).toBe("Blocked");
    expect(() => transitionPo(blocked, "Confirm verification", time, actor, true)).toThrow(
      "Resolve",
    );
    const clean = { ...state, result: checkPurchaseOrder(state.po ?? context.expected, context) };
    expect(lifecycleStatus(clean, true)).toBe("Blocked");
    expect(() => transitionPo(clean, "Confirm verification", time, actor, true, true)).toThrow(
      "configuration",
    );
  });
  it("partial discrepancy acceptance keeps lifecycle correction-required; full acceptance preserves issue gate", () => {
    const { context, state } = issued();
    const po = demoPurchaseOrder(context, "Non-critical discrepancy"),
      result = checkPurchaseOrder(po, context);
    const items = result.items.filter((i) => i.status === "requires_review");
    expect(items.length).toBe(2);
    const first = items[0];
    if (!first) throw new Error("Review item required");
    let resolutions = resolvePoItem(
      result,
      [],
      first.id,
      "accepted",
      "Buyer verified synthetic policy",
      time,
    );
    expect(lifecycleStatus({ ...state, po, result, resolutions })).toBe("Requires correction");
    for (const i of items.slice(1))
      resolutions = resolvePoItem(
        result,
        resolutions,
        i.id,
        "accepted",
        "Buyer verified synthetic policy",
        time,
      );
    const accepted = { ...state, po, result, resolutions };
    expect(lifecycleStatus(accepted)).toBe("Awaiting release");
    expect(poReleaseAllowed(accepted, true, false)).toBe(false);
  });
  it("preserves legacy PO check/release compatibility and old JSON snapshots", () => {
    const { context } = fixture();
    const old = loadAndCheckPo(
      demoPurchaseOrder(context, "Correct PO"),
      context,
      fixture().draft.tolerances,
    );
    expect(poReleaseAllowed(old, true, false)).toBe(true);
    expect(lifecycleStatus(JSON.parse(JSON.stringify(old)))).toBe("Awaiting release");
  });
  it("records each saved field's previous/new value with a readable label", () => {
    const { draft } = fixture();
    if (!draft.po) throw new Error("PO required");
    const edited = { ...draft.po, unitPrice: 19000 };
    const audit = draftEditAudit(draft.po, edited);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.previousValue).toBe(18450);
    expect(audit[0]?.newValue).toBe(19000);
    expect(
      describeAudit({
        ...audit[0],
        action: "PO draft field saved",
        id: "1",
        actor,
        timestamp: time,
      }),
    ).toContain("Check Unit price");
    const saved = savePoDraft(draft, edited, time, actor);
    expect(saved.po?.unitPrice).toBe(19000);
    expect(saved.result).toBeUndefined();
    expect(lifecycleAudit("Draft saved", draft, saved).details?.["status"]).toBe("Draft");
  });
  it("draft evidence never completes the ERP PO-issued stage", () => {
    const steps = erpProcessSteps({
      setupValid: true,
      documents: sampleDocuments,
      extracting: false,
      comparisonComputed: true,
      decisionApproved: true,
      hasPo: true,
      poIssued: false,
      poChecked: false,
      poStatus: "PO awaiting check",
      configurationBlocked: false,
    });
    expect(steps[5]?.status).toBe("In progress");
    expect(steps[6]?.status).toBe("Not started");
  });
});
describe("PO document and list evidence", () => {
  it("uses actual selected-supplier values and keeps missing logistics separate from combined estimates", () => {
    const { context, state } = issued();
    const doc = buildPoDocument(state, context);
    expect(doc?.disclaimer).toContain("no commercial validity");
    expect(
      doc?.sections.find((s) => s.title === "Additional costs and total")?.rows,
    ).toContainEqual(["Freight", "Not provided"]);
    expect(
      doc?.sections.find((s) => s.title === "Additional costs and total")?.rows,
    ).toContainEqual(["Combined logistics estimate (system assumption)", "USD 8,856.00"]);
    expect(doc?.sections.find((s) => s.title === "Approval and traceability")?.rows).toContainEqual(
      ["Approved annual landed cost", "USD 230,256.00"],
    );
  });
  it("renders the immutable issued version instead of a subsequently mutated PO", () => {
    const { context, state } = issued();
    if (!state.po) throw new Error("PO required");
    const doc = buildPoDocument(
      { ...state, po: { ...state.po, supplier: "Unexpected mutation" } },
      context,
    );
    expect(doc?.sections.find((s) => s.title === "Supplier and delivery")?.rows).toContainEqual([
      "Supplier",
      "Atlas Controls INC",
    ]);
  });
  it("provenance keeps quoted price, approved price and divergent PO price separate", () => {
    const { context, state } = issued();
    const po = demoPurchaseOrder(context, "Blocked PO");
    const data = { ...state, po, lifecycle: undefined, result: checkPurchaseOrder(po, context) };
    const row = poProvenance(data, context).rows.find((r) => r[0] === "Unit price");
    expect(row?.slice(1, 4)).toEqual(["18,450", "18,450", "19,003.5"]);
    expect(row?.[4]).toContain("Blocker");
  });
  it("lists current and superseded immutable versions; filters, dates and CSV retain human labels", () => {
    const { state } = issued();
    const amended = transitionPo(state, "Amend", time, actor, true),
      rows = poListRows(amended);
    expect(rows.map((r) => r.status)).toEqual(["Superseded", "Draft"]);
    const f = {
      search: "",
      status: "Superseded",
      supplier: "",
      buyer: "",
      currency: "USD",
      from: "2026-10-25",
      to: "2026-10-25",
      sort: "updated" as const,
    };
    expect(filterPoList(rows, f)).toHaveLength(1);
    expect(filterPoList(rows, { ...f, rfq: "RFQ-other" })).toHaveLength(0);
    expect(filterPoList(rows, { ...f, rfq: "RFQ-24410" })).toHaveLength(1);
    expect(filterPoList(rows, { ...f, from: "2027-01-01" })).toHaveLength(0);
    expect(poListCsv(rows)).toContain('"PO number","RFQ","Supplier"');
    expect(poListCsv(rows)).not.toContain("totalValue");
    const restored = JSON.parse(JSON.stringify(amended));
    expect(poListRows(restored)).toHaveLength(2);
    expect(restored.lifecycle.history[0].po.unitPrice).toBe(18450);
  });
});
