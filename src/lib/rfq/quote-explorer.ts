import type { Intelligence } from "./intelligence";
import type { QuoteDocument } from "./workflow";
import { averageConfidence } from "./workflow";
import { classifyEligibility, ELIGIBILITY_LABELS } from "./eligibility";
import type { EligibilityStatus } from "./review-types";
import { normalizeSupplierName } from "./supplier-name";

export interface ExplorerRow { id: string; supplier: string; quoteId: string; rfq: string; partNumber: string; revision: string; currency: string; status: string; eligibility: EligibilityStatus; eligibilityLabel: string; risk: string; landed: number | null; unitPrice: number | null; score: number | null; leadTime: number | null; confidence: number | null; recommended: boolean }
export type ExplorerView = "all" | "eligible" | "shortlist" | "blocked" | "awaiting" | "selected";
export type SortKey = "landed" | "unitPrice" | "score" | "leadTime" | "confidence";
export interface ExplorerFilters { search: string; revision: string; eligibility: string; risk: string; currency: string; status: string; view: ExplorerView; sort: SortKey; selected: string[] }
export const EMPTY_FILTERS: ExplorerFilters = { search: "", revision: "", eligibility: "", risk: "", currency: "", status: "", view: "all", sort: "landed", selected: [] };
export const VIEW_LABELS: Record<ExplorerView, string> = { all: "All", eligible: "Eligible only", shortlist: "Recommendation + alternatives", blocked: "Blocked", awaiting: "Awaiting validation", selected: "Selected" };
export const SORT_LABELS: Record<SortKey, string> = { landed: "Annual landed cost", unitPrice: "Unit price (USD)", score: "Score", leadTime: "Lead time", confidence: "AI confidence" };

export function explorerRows(documents: QuoteDocument[], list: Intelligence[], rfq: string, recommendedId: string | null): ExplorerRow[] {
  return documents.map((d) => {
    const a = list.find((x) => x.document.id === d.id) ?? null, q = d.reviewed ?? d.original;
    const e = classifyEligibility(a, d);
    return { id: d.id, supplier: a?.name ?? normalizeSupplierName(q?.supplier_name ?? null, d.text).name ?? d.fileName, quoteId: q?.quote_id ?? "Not provided", rfq, partNumber: q?.part_number ?? "Not provided",
      revision: q?.revision ?? "Not provided", currency: q?.currency ?? "Not provided", status: d.excluded ? "Held for validation" : d.confirmed ? "Buyer validated" : d.status === "Error" ? "Error" : "Awaiting validation",
      eligibility: e.status, eligibilityLabel: ELIGIBILITY_LABELS[e.status], risk: a?.risk ?? "Not calculated", landed: a?.annualLanded ?? null, unitPrice: a?.baseline.unitPriceUsd ?? null, score: a?.score ?? null,
      leadTime: q?.lead_time_days ?? null, confidence: q ? averageConfidence(q) : null, recommended: d.id === recommendedId };
  });
}
const matches = (r: ExplorerRow, f: ExplorerFilters, shortlist: Set<string>) => {
  const s = f.search.trim().toLowerCase();
  if (s && ![r.supplier, r.quoteId, r.rfq, r.partNumber].some((v) => v.toLowerCase().includes(s))) return false;
  if (f.revision && r.revision !== f.revision) return false; if (f.eligibility && r.eligibility !== f.eligibility) return false;
  if (f.risk && r.risk !== f.risk) return false; if (f.currency && r.currency !== f.currency) return false; if (f.status && r.status !== f.status) return false;
  if (f.view === "eligible") return r.eligibility === "eligible" || r.eligibility === "eligible_with_caveats";
  if (f.view === "blocked") return r.eligibility === "not_eligible";
  if (f.view === "awaiting") return r.eligibility === "awaiting_review";
  if (f.view === "selected") return f.selected.includes(r.id);
  if (f.view === "shortlist") return shortlist.has(r.id);
  return true;
};
/** Pure, non-mutating, stable: ties keep original order; missing values sort last. */
export function filterAndSort(rows: readonly ExplorerRow[], f: ExplorerFilters): ExplorerRow[] {
  const eligible = rows.filter((r) => r.eligibility === "eligible" || r.eligibility === "eligible_with_caveats").sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const shortlist = new Set([...rows.filter((r) => r.recommended), ...eligible].slice(0, 4).map((r) => r.id));
  const desc = f.sort === "score" || f.sort === "confidence";
  return rows.map((r, i) => ({ r, i })).filter(({ r }) => matches(r, f, shortlist)).sort((a, b) => {
    const x = a.r[f.sort], y = b.r[f.sort];
    if (x == null && y == null) return a.i - b.i; if (x == null) return 1; if (y == null) return -1;
    return (desc ? y - x : x - y) || a.i - b.i;
  }).map(({ r }) => r);
}
export function activeFilters(f: ExplorerFilters): { key: keyof ExplorerFilters; label: string }[] {
  const out: { key: keyof ExplorerFilters; label: string }[] = [];
  if (f.search) out.push({ key: "search", label: `Search: ${f.search}` }); if (f.revision) out.push({ key: "revision", label: `Revision: ${f.revision}` });
  if (f.eligibility) out.push({ key: "eligibility", label: `Eligibility: ${ELIGIBILITY_LABELS[f.eligibility as EligibilityStatus] ?? f.eligibility}` });
  if (f.risk) out.push({ key: "risk", label: `Risk: ${f.risk}` }); if (f.currency) out.push({ key: "currency", label: `Currency: ${f.currency}` }); if (f.status) out.push({ key: "status", label: `Status: ${f.status}` });
  if (f.view !== "all") out.push({ key: "view", label: `View: ${VIEW_LABELS[f.view]}` });
  return out;
}
export function statusTotals(rows: readonly ExplorerRow[]) {
  const c = (s: EligibilityStatus) => rows.filter((r) => r.eligibility === s).length;
  return { total: rows.length, eligible: c("eligible"), caveats: c("eligible_with_caveats"), notEligible: c("not_eligible"), awaiting: c("awaiting_review") };
}
/** Charts: recommended + most relevant suppliers (lowest landed cost first) unless the buyer selects or expands. */
export function chartFocus(list: Intelligence[], recommendedId: string | null, selected: string[], showAll: boolean, limit = 6): Intelligence[] {
  if (showAll || list.length <= limit) return list;
  if (selected.length) return list.filter((a) => selected.includes(a.document.id) || a.document.id === recommendedId);
  const keep = new Set([...new Set([recommendedId, ...list.filter((a) => a.eligible).map((a) => a.document.id), ...list.map((a) => a.document.id)].filter((x): x is string => Boolean(x)))].slice(0, limit));
  return list.filter((a) => keep.has(a.document.id));
}
