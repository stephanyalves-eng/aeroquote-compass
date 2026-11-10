import { describe, it, expect } from "vitest";
import { writeDraft, readDraft, clearDraft, reviveReferenceNumbers, shouldWarnBeforeUnload, DRAFT_STORAGE_KEY, DRAFT_SCHEMA_VERSION, type StorageLike } from "./draft-storage";
import { resolveView, viewSlug } from "./view-route";
import { suggestedRfqStatus, rfqStatusMismatch, viewProgressLabel } from "./rfq-status";
import { identityLabel, ownerLabel } from "./identity";
import { workspaceHasRfq } from "./unsaved-work";
import { blankRfqReference, referenceErrors } from "./workflow";
import { trackedWeeksLabel, periodTotalLabel, recommendationDisplayRange, hasRecommendationData } from "./weekly-recommendations";
import type { ErpProcessStep } from "./erp-nav";

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const full: StorageLike = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => { throw new Error("blocked"); } };

describe("draft persistence", () => {
  it("round-trips a versioned draft and clears it", () => {
    const s = memory();
    expect(writeDraft(s, { a: 1 }, "2026-11-10T00:00:00Z")).toBe(true);
    expect(JSON.parse(s.data.get(DRAFT_STORAGE_KEY)!).version).toBe(DRAFT_SCHEMA_VERSION);
    expect(readDraft<{ a: number }>(s)?.workspace.a).toBe(1);
    clearDraft(s);
    expect(readDraft(s)).toBeNull();
  });
  it("never throws when storage is unavailable or full", () => {
    expect(writeDraft(null, {}, "x")).toBe(false);
    expect(writeDraft(full, {}, "x")).toBe(false);
    expect(() => clearDraft(full)).not.toThrow();
    expect(readDraft(null)).toBeNull();
  });
  it("ignores other schema versions and corrupt JSON", () => {
    const s = memory();
    s.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 999, workspace: {} }));
    expect(readDraft(s)).toBeNull();
    s.setItem(DRAFT_STORAGE_KEY, "{not json");
    expect(readDraft(s)).toBeNull();
  });
  it("restores blank numeric RFQ inputs as not entered", () => {
    const r = reviveReferenceNumbers({ annualVolume: null, usdBrl: 5, eurBrl: 6, incotermAdders: { EXW: null, FCA: 1 } } as Record<string, unknown>);
    expect(Number.isNaN(r["annualVolume"])).toBe(true);
    expect(Number.isNaN((r["incotermAdders"] as Record<string, number>)["EXW"])).toBe(true);
  });
  it("warns before leaving only when the latest work is not stored", () => {
    expect(shouldWarnBeforeUnload({ unsaved: true, poFormDirty: false, current: "a", storedFingerprint: "a" })).toBe(false);
    expect(shouldWarnBeforeUnload({ unsaved: true, poFormDirty: false, current: "b", storedFingerprint: "a" })).toBe(true);
    expect(shouldWarnBeforeUnload({ unsaved: true, poFormDirty: false, current: "a", storedFingerprint: null })).toBe(true);
    expect(shouldWarnBeforeUnload({ unsaved: false, poFormDirty: false, current: "a", storedFingerprint: null })).toBe(false);
    expect(shouldWarnBeforeUnload({ unsaved: false, poFormDirty: true, current: "a", storedFingerprint: "a" })).toBe(true);
  });
});

describe("addressable screens", () => {
  const none = { ready: false, decision: false, hasDocuments: false };
  it("maps slugs to screens and back", () => {
    expect(resolveView("quotations", none)).toMatchObject({ step: 1, reason: null });
    expect(viewSlug(9)).toBe("release-control");
    expect(resolveView(undefined, none)).toMatchObject({ step: -1, reason: null });
    expect(resolveView("history", none).history).toBe(true);
  });
  it("falls back from Purchase Orders without a decision to the nearest allowed screen", () => {
    expect(resolveView("purchase-orders", { ready: true, decision: false, hasDocuments: true })).toMatchObject({ step: 4, slug: "decisions" });
    const r = resolveView("purchase-orders", { ...none, hasDocuments: true });
    expect(r.step).toBe(2);
    expect(r.reason).toContain("Record a decision first");
    expect(resolveView("comparison", none)).toMatchObject({ step: 1, slug: "quotations" });
    expect(resolveView("purchase-orders", { ready: true, decision: true, hasDocuments: true })).toMatchObject({ step: 5, reason: null });
  });
  it("sends unknown screens to the dashboard with an explanation", () => {
    expect(resolveView("nope", none)).toMatchObject({ step: -1, slug: "dashboard" });
    expect(resolveView("nope", none).reason).toContain("does not exist");
  });
});

const tracker = (completed: number): ErpProcessStep[] =>
  ["RFQ created", "Quotes received", "Buyer validation", "Comparison complete", "Decision approved", "PO issued", "PO verified", "Released"].map((label, i) => ({ label, detail: "", status: i < completed ? "Completed" : i === completed ? "In progress" : "Not started" }));

describe("RFQ status and progress labels", () => {
  it("suggests status from tracker evidence", () => {
    expect(suggestedRfqStatus(tracker(0))).toBe("Draft");
    expect(suggestedRfqStatus(tracker(2))).toBe("Analyzing");
    expect(suggestedRfqStatus(tracker(4))).toBe("Under Negotiation");
    expect(suggestedRfqStatus(tracker(5))).toBe("Awarded");
    expect(suggestedRfqStatus(tracker(8))).toBe("Completed");
  });
  it("flags Completed or Awarded before the decision is approved", () => {
    expect(rfqStatusMismatch("Completed", tracker(4))).toContain("Released is not started");
    expect(rfqStatusMismatch("Awarded", tracker(4))).toContain("Decision approved is in progress");
    expect(rfqStatusMismatch("Awarded", tracker(5))).toBeNull();
    expect(rfqStatusMismatch("Draft", tracker(8))).toBeNull();
  });
  it("derives the eyebrow from the same eight-stage tracker", () => {
    expect(viewProgressLabel(2, tracker(0))).toBe("Stage 3 of 8 · Buyer validation");
    expect(viewProgressLabel(9, tracker(0))).toBe("Stage 8 of 8 · Released");
    expect(viewProgressLabel(7, tracker(0))).toBe("Traceability");
  });
});

describe("new RFQ defaults and identity", () => {
  it("starts annual volume empty and requires it", () => {
    const r = blankRfqReference();
    expect(Number.isNaN(r["annualVolume"])).toBe(true);
    expect(referenceErrors(r)).toContain("Annual volume must be a positive whole number.");
  });
  it("shows Demo mode when signed out and the user when signed in", () => {
    expect(identityLabel(null)).toMatchObject({ primary: "Demo mode", signedIn: false });
    expect(identityLabel(null).secondary).toContain("Fictional");
    expect(identityLabel({ email: "buyer@example.com" })).toMatchObject({ primary: "buyer@example.com", signedIn: true });
    expect(ownerLabel(null)).toBe("Marina Costa (fictional demo buyer)");
  });
  it("detects whether the workspace has RFQ content", () => {
    const base = { reference: { rfqNumber: "", partNumber: "" }, documents: [], auditEvents: [], unsaved: false };
    expect(workspaceHasRfq(base)).toBe(false);
    expect(workspaceHasRfq({ ...base, reference: { rfqNumber: "RFQ-1" } })).toBe(true);
    expect(workspaceHasRfq({ ...base, documents: [{}] })).toBe(true);
  });
});

describe("weekly recommendations copy", () => {
  it("pluralizes tracked weeks and never shows Unknown RFQs", () => {
    expect(trackedWeeksLabel(1)).toBe("1 tracked week");
    expect(trackedWeeksLabel(3)).toBe("3 tracked weeks");
    expect(periodTotalLabel(null)).toBe("Not tracked yet");
    expect(periodTotalLabel(1)).toBe("1 RFQ");
  });
  it("uses one range definition ending today for the current week", () => {
    const r = recommendationDisplayRange("2026-10-19", "2026-11-10", "2026-11-10T15:00:00Z");
    expect(r).toMatchObject({ start: "2026-10-19", end: "2026-11-10", toDate: true });
    expect(r.label).toBe("2026-10-19 – 2026-11-10 (to date)");
    expect(recommendationDisplayRange("2026-10-21", "2026-11-01", "2026-11-10T15:00:00Z")).toMatchObject({ start: "2026-10-19", end: "2026-11-01", toDate: false });
  });
  it("shows the chart only with data", () => {
    expect(hasRecommendationData([{ week: "w", real: 0, demo: null, coverage: "Partial" }], "real")).toBe(false);
    expect(hasRecommendationData([{ week: "w", real: 2, demo: 0, coverage: "Complete" }], "real")).toBe(true);
  });
});
