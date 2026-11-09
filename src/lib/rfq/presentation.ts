import type { Intelligence } from "./intelligence";
import type { RfqReference } from "./types";
import type { ReviewIssue } from "./review-types";
import type { PoState } from "./po-types";
import { poSummary } from "./po-check";
import { sameSupplier } from "./supplier-name";
import { reviewSummary, fieldConfirmed, quotationConfirmationErrors } from "./review-issues";
import type { QuoteDocument } from "./workflow";

/** Accurate acknowledged award blockers are not pending buyer-validation tasks. */
export function pendingReviewBlockers(documents: QuoteDocument[], reference: RfqReference) {
  const included = documents.filter((d) => !d.excluded);
  return reviewSummary(included, reference).issues.filter((i) => {
    if (i.kind !== "critical") return false;
    const d = included.find((x) => x.id === i.documentId);
    return Boolean(d && (!fieldConfirmed(d, i.field.key) || quotationConfirmationErrors(d).length));
  }).length;
}

/** Shortlists change the view only, never award eligibility or calculations. */
export function toggleShortlist(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= 4 ? [...selected] : [...selected, id];
}
export function comparisonHighlights(list: readonly Intelligence[], reference: RfqReference, recommendedId: string | null) {
  const eligible = list.filter((a) => a.eligible && a.document.id !== recommendedId).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const unit = list.filter((a) => a.baseline.unitPriceUsd != null).sort((a, b) => (a.baseline.unitPriceUsd ?? Infinity) - (b.baseline.unitPriceUsd ?? Infinity));
  return [
    { label: "Recommended", supplier: list.find((a) => a.document.id === recommendedId) },
    { label: "Best eligible alternative", supplier: eligible[0] },
    { label: "Current supplier", supplier: list.find((a) => sameSupplier(a.name, reference.incumbentSupplier)) },
    { label: "Lowest unit price", supplier: unit[0] },
  ];
}
const priority: Record<ReviewIssue["kind"], number> = { critical: 0, missing: 1, low_confidence: 2, divergence: 3, unconfirmed: 4 };
export function pendingItems(issues: readonly ReviewIssue[], filter: string, search: string, sort: "severity" | "supplier") {
  const needle = search.trim().toLowerCase();
  return issues.filter((i) => (filter === "all" || filter === "review" || i.kind === filter) && (!needle || [i.supplier, i.fileName, i.documentId, i.field.label].some((v) => v.toLowerCase().includes(needle))))
    .sort((a, b) => sort === "supplier" ? a.supplier.localeCompare(b.supplier) || priority[a.kind] - priority[b.kind] : priority[a.kind] - priority[b.kind] || a.supplier.localeCompare(b.supplier));
}
export const PO_PROGRESS_LABELS = ["Awaiting PO", "PO loaded", "PO checked", "Discrepancies reviewed", "Revision verified", "Ready for release", "Released"] as const;
/** Configuration is a separate barrier; accepted discrepancies never bypass it. */
export function poProgress(state: PoState, approved: boolean, configurationBlocked: boolean) {
  const summary = poSummary(state.result, state.resolutions);
  const loaded = approved && Boolean(state.po);
  const checked = loaded && Boolean(state.result);
  const reviewed = checked && summary.canRelease;
  const revision = reviewed && !configurationBlocked;
  const released = revision && state.released;
  const evidence = [approved, loaded, checked, reviewed, revision, revision, released];
  const firstOpen = evidence.findIndex((done) => !done);
  return PO_PROGRESS_LABELS.map((label, index) => ({ label, status: evidence[index] ? "Complete" : index === firstOpen ? (index === 3 && (summary.blockers > 0 || Boolean(state.result?.validationErrors.length)) || index === 4 && configurationBlocked ? "Blocked" : "Current") : "Pending" }));
}