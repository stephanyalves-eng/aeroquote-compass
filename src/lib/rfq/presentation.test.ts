import { describe, expect, it } from "vitest";
import { pendingItems, poProgress, toggleShortlist, comparisonHighlights } from "./presentation";
import { compareDocuments, DEFAULT_WEIGHTS, decisionInsights } from "./intelligence";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import { createApprovedDecision } from "./recommendation";
import { buildApprovedPoContext, emptyPoState, loadAndCheckPo, releasePurchase, resolvePoItem } from "./po-check";
import { demoPurchaseOrder } from "./po-samples";
import { reviewIssues } from "./review-issues";

const list = compareDocuments(sampleDocuments, sampleReference, DEFAULT_WEIGHTS);
const recommended = decisionInsights(list, sampleReference).recommended;
if (!recommended) throw new Error("Missing recommendation");
const decision = createApprovedDecision(list, sampleReference, DEFAULT_WEIGHTS, recommended.document.id, "", "2026-10-25");
const context = buildApprovedPoContext(sampleReference, recommended, decision);
describe("presentation-only procurement views", () => {
  it("limits shortlist to four, removes selections and leaves source untouched", () => {
    const ids = ["a", "b", "c", "d"];
    expect(toggleShortlist(ids, "e")).toEqual(ids);
    expect(toggleShortlist(ids, "b")).toEqual(["a", "c", "d"]);
    expect(toggleShortlist(["a"], "b")).toEqual(["a", "b"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
  it("highlights eligible recommendation/alternative, actual incumbent and lowest unit price independently", () => {
    const highlights = comparisonHighlights(list, sampleReference, recommended.document.id);
    expect(highlights[0]?.supplier?.name).toBe("Atlas Controls INC");
    expect(highlights[1]?.supplier?.eligible).toBe(true);
    expect(highlights[1]?.supplier?.document.id).not.toBe(recommended.document.id);
    expect(highlights[2]?.supplier?.name).toBe("Meridian Flight Components LLC");
    expect(highlights[3]?.supplier?.baseline.unitPriceUsd).toBe(Math.min(...list.map((a) => a.baseline.unitPriceUsd ?? Infinity)));
  });
  it("orders critical issues first and searches suppliers, quote identifiers and human field labels", () => {
    const docs = sampleDocuments.map((d) => ({ ...d, confirmed: false, fieldStatus: {} }));
    const issues = reviewIssues(docs, sampleReference);
    const sorted = pendingItems(issues, "all", "", "severity");
    expect(sorted[0]?.kind).toBe("critical");
    expect(pendingItems(issues, "critical", "unit price", "severity").every((i) => i.kind === "critical" && i.field.label.toLowerCase().includes("unit price"))).toBe(true);
    const first = sorted[0];
    if (!first) throw new Error("No pending issues");
    expect(pendingItems(issues, "all", first.documentId, "severity").some((i) => i.id === first.id)).toBe(true);
    expect(pendingItems(issues, "all", "no-such-supplier", "severity")).toEqual([]);
  });
  it("starts with no completed PO steps before approval and no later completions", () => {
    expect(poProgress(emptyPoState(), false, false).map((s) => s.status)).toEqual(["Current", "Pending", "Pending", "Pending", "Pending", "Pending", "Pending"]);
    expect(poProgress(emptyPoState(), true, false)[1]?.status).toBe("Current");
  });
  it("keeps partial acceptance and correction requests from completing discrepancy review", () => {
    let state = loadAndCheckPo(demoPurchaseOrder(context, "Non-critical discrepancy"), context, emptyPoState().tolerances);
    const result = state.result;
    if (!result) throw new Error("No result");
    const reviews = result.items.filter((i) => i.status === "requires_review");
    expect(reviews.length).toBeGreaterThan(1);
    const first = reviews[0];
    if (!first) throw new Error("No review");
    state = { ...state, resolutions: resolvePoItem(result, [], first.id, "accepted", "Reviewed synthetic discrepancy.", "2026-10-25") };
    expect(poProgress(state, true, false)[3]?.status).toBe("Current");
    for (const item of reviews) state = { ...state, resolutions: resolvePoItem(result, state.resolutions, item.id, "accepted", "Reviewed synthetic discrepancy.", "2026-10-25") };
    expect(poProgress(state, true, false)[5]?.status).toBe("Complete");
    expect(poProgress(state, true, false)[6]?.status).toBe("Current");
  });
  it("blocks revision completion and release even with a clean commercial check", () => {
    const state = loadAndCheckPo(demoPurchaseOrder(context, "Correct PO"), context, emptyPoState().tolerances);
    expect(poProgress(state, true, true).slice(4).map((s) => s.status)).toEqual(["Blocked", "Pending", "Pending"]);
    expect(poProgress(releasePurchase(state, true), true, false).every((s) => s.status === "Complete")).toBe(true);
    expect(poProgress(releasePurchase(state, true), false, false).every((s) => s.status !== "Complete")).toBe(true);
  });
  it("critical demo discrepancies block review and every downstream step", () => {
    const state = loadAndCheckPo(demoPurchaseOrder(context, "Blocked PO"), context, emptyPoState().tolerances);
    expect(poProgress(state, true, false).slice(3).map((s) => s.status)).toEqual(["Blocked", "Pending", "Pending", "Pending"]);
  });
});