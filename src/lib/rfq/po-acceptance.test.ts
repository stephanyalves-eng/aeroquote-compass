import { describe, it, expect } from "vitest";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { createApprovedDecision } from "./recommendation";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import { buildApprovedPoContext, DEFAULT_PO_TOLERANCES, loadAndCheckPo, poResolutionAudit, poSummary, purchaseOrderStatus, releasePurchase, resolvePoItem } from "./po-check";
import { demoPurchaseOrder, PO_SCENARIOS } from "./po-samples";
import { createAuditEvent, DEMO_BUYER } from "./audit";
import { describeAudit } from "./audit-describe";
import type { PoState } from "./po-types";

const ref = { ...sampleReference, description: "Hydraulic actuator Y8", deliveryLocation: "São José dos Campos" };
const list = compareDocuments(sampleDocuments, ref, DEFAULT_WEIGHTS);
const atlas = list.find((a) => a.name.startsWith("Atlas"))!;
const context = buildApprovedPoContext(ref, atlas, createApprovedDecision(list, ref, DEFAULT_WEIGHTS, atlas.document.id, "", "2026-10-25T12:00:00Z"));
const T = "2026-10-25T12:00:00.000Z";
const JUST = "Buyer reviewed and accepted this discrepancy.";

/** Accept every open review item in order, recording the audit event exactly as the app does. */
function acceptAll(s: PoState, upTo = Infinity) {
  const r = s.result!; const open = r.items.filter((i) => i.status === "requires_review");
  let resolutions = s.resolutions; const events = [];
  for (const i of open.slice(0, upTo)) { resolutions = resolvePoItem(r, resolutions, i.id, "accepted", JUST, T); events.push(createAuditEvent({ id: i.id, timestamp: T, ...poResolutionAudit(r, s.po, i.id, "accepted", JUST) })); }
  return { state: { ...s, resolutions }, events, open };
}
// Expected outcome per demo PO: blockers present? review items present?
const EXPECT: Record<string, { blocked: boolean; review: boolean }> = {
  "Correct PO": { blocked: false, review: false }, "Within tolerance": { blocked: false, review: false }, "Non-critical discrepancy": { blocked: false, review: true },
  "Blocked PO": { blocked: true, review: false }, "Wrong supplier": { blocked: true, review: false }, "Previous drawing revision": { blocked: true, review: false },
};

describe("accepting PO discrepancies across every demo PO", () => {
  it("covers all six demo POs", () => expect([...PO_SCENARIOS]).toEqual(Object.keys(EXPECT)));
  for (const scenario of PO_SCENARIOS) describe(scenario, () => {
    const s = loadAndCheckPo(demoPurchaseOrder(context, scenario), context, DEFAULT_PO_TOLERANCES);
    const blockers = s.result!.items.filter((i) => i.status === "blocker");
    const review = s.result!.items.filter((i) => i.status === "requires_review");
    it("matches the expected blocker / review profile", () => { expect(blockers.length > 0).toBe(EXPECT[scenario]!.blocked); expect(review.length > 0).toBe(EXPECT[scenario]!.review); });
    it("blockers can never be accepted, even with a justification", () => {
      for (const b of blockers) expect(() => resolvePoItem(s.result!, [], b.id, "accepted", JUST, T)).toThrow("Blockers");
    });
    it("acceptance without a written justification is rejected", () => {
      for (const i of review) for (const j of ["", "   "]) expect(() => resolvePoItem(s.result!, [], i.id, "accepted", j, T)).toThrow("justification");
    });
    it("confirmed items cannot be 'accepted'", () => {
      const ok = s.result!.items.find((i) => i.status === "confirmed");
      if (ok) expect(() => resolvePoItem(s.result!, [], ok.id, "accepted", JUST, T)).toThrow("open discrepancy");
    });
    it("partial acceptance keeps release blocked; full acceptance allows it only without blockers", () => {
      if (review.length > 1) {
        const partial = acceptAll(s, review.length - 1).state;
        expect(poSummary(partial.result, partial.resolutions).discrepancies).toBe(1);
        expect(purchaseOrderStatus(partial)).toBe("PO with discrepancies");
        expect(() => releasePurchase(partial, true)).toThrow();
      }
      const { state } = acceptAll(s);
      expect(poSummary(state.result, state.resolutions).discrepancies).toBe(0);
      if (EXPECT[scenario]!.blocked) { expect(purchaseOrderStatus(state)).toBe("PO blocked"); expect(() => releasePurchase(state, true)).toThrow(); }
      else {
        expect(purchaseOrderStatus(state)).toBe("PO checked, awaiting release");
        expect(() => releasePurchase(state, false)).toThrow();
        expect(purchaseOrderStatus(releasePurchase(state, true))).toBe("PO checked and released");
      }
    });
    it("stores justification, actor and timestamp, and writes one readable audit event per acceptance", () => {
      const { state, events, open } = acceptAll(s);
      expect(state.resolutions).toHaveLength(open.length);
      for (const r of state.resolutions) { expect(r).toMatchObject({ action: "accepted", justification: JUST, timestamp: T, actor: DEMO_BUYER }); expect(r.fingerprint).toBe(open.find((i) => i.id === r.itemId)!.fingerprint); }
      expect(events).toHaveLength(open.length);
      events.forEach((e, n) => {
        expect(e.action).toBe("PO discrepancy accepted"); expect(e.actor).toBe(DEMO_BUYER); expect(e.timestamp).toBe(T);
        const text = describeAudit(e);
        expect(text).toContain(`Check ${open[n]!.fieldLabel}`); expect(text).toContain(`PO ${s.po!.poNumber}`); expect(text).toContain(`Justification: ${JUST}`);
        expect(text).not.toMatch(/\b[a-z]+[A-Z][a-zA-Z]+\b|[{}]/);
      });
    });
  });
  it("correction request is audited and does not count as acceptance", () => {
    const s = loadAndCheckPo(demoPurchaseOrder(context, "Non-critical discrepancy"), context, DEFAULT_PO_TOLERANCES);
    const i = s.result!.items.find((x) => x.status === "requires_review")!;
    const resolutions = resolvePoItem(s.result!, [], i.id, "correction_requested", "", T);
    expect(poSummary(s.result, resolutions).discrepancies).toBe(s.result!.items.filter((x) => x.status === "requires_review").length);
    expect(createAuditEvent({ id: "c", timestamp: T, ...poResolutionAudit(s.result!, s.po, i.id, "correction_requested", "") }).action).toBe("PO correction requested");
  });
  it("re-accepting an item replaces the earlier resolution instead of duplicating it", () => {
    const s = loadAndCheckPo(demoPurchaseOrder(context, "Non-critical discrepancy"), context, DEFAULT_PO_TOLERANCES);
    const i = s.result!.items.find((x) => x.status === "requires_review")!;
    const once = resolvePoItem(s.result!, [], i.id, "correction_requested", "", T);
    const twice = resolvePoItem(s.result!, once, i.id, "accepted", JUST, T);
    expect(twice.filter((r) => r.itemId === i.id)).toHaveLength(1); expect(twice[0]!.action).toBe("accepted");
  });
});
