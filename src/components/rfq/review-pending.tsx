import { useState } from "react";
import { Check, Pencil, RotateCcw, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REVIEW_FIELDS, type QuoteDocument } from "@/lib/rfq/workflow";
import { reviewSummary, fieldConfirmed, formatReviewValue, bulkReviewPreview, LOW_CONFIDENCE_THRESHOLD, BULK_CONFIRM_THRESHOLD } from "@/lib/rfq/review-issues";
import type { ReviewField } from "@/lib/rfq/review-types";
import type { RfqReference } from "@/lib/rfq/types";
import { pendingItems } from "@/lib/rfq/presentation";
import { Section, Field, control } from "./primitives";

export interface ReviewActions {
  onFieldConfirm: (id: string, field: ReviewField) => void;
  onFollowUp: (id: string, field: ReviewField) => void;
  onBulkConfirm: (id?: string) => void;
  onReset: (id: string, field: ReviewField) => void;
}
export function ReviewPending({ documents, reference, selectedId, onFocus, ...actions }: ReviewActions & { documents: QuoteDocument[]; reference: RfqReference; selectedId?: string | undefined; onFocus: (id: string, field: ReviewField) => void }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"severity" | "supplier">("severity");
  const [viewAll, setViewAll] = useState(false);
  const resetView = () => setViewAll(false);
  const summary = reviewSummary(documents, reference);
  const confirmed = documents.flatMap((d) => d.reviewed ? REVIEW_FIELDS.filter((f) => fieldConfirmed(d, f.key)).map((f) => ({ d, f })) : []);
  const filters = [
    ["critical", "Critical blockers", summary.critical], ["missing", "Missing fields", summary.missing],
    ["low_confidence", "Low confidence", summary.lowConfidence], ["divergence", "Divergences", summary.divergences],
    ["ready", "Ready for comparison", summary.confirmed], ["all", "All pending", summary.issues.length], ["confirmed", "Buyer-validated fields", confirmed.length],
  ] as const;
  const allItems = pendingItems(summary.issues, filter, search, sort);
  const items = viewAll ? allItems : allItems.slice(0, 8);
  const matchesSearch = (...values: string[]) => values.some((v) => v.toLowerCase().includes(search.trim().toLowerCase()));
  const confirmedResults = confirmed.filter(({ d, f }) => matchesSearch(d.fileName, d.id, d.reviewed?.supplier_name ?? "", f.label));
  const quotations = summary.quotations.filter((q) => (filter !== "ready" || q.canProceed) && matchesSearch(q.supplier, q.documentId, documents.find((d) => d.id === q.documentId)?.reviewed?.quote_id ?? ""));
  const { globalCount, selectedCount, criticalLeft } = bulkReviewPreview(documents, reference, selectedId);
  const selected = documents.find((d) => d.id === selectedId);
  return <Section title="Review pending items" action={<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Buyer verification</span>}>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">{[
      ["Total quotations", summary.total], ["Quotations confirmed", summary.confirmed], ["Requiring review", summary.requiringReview], ["Confirmed fields", summary.confirmedFields],
      ["Low-confidence fields", summary.lowConfidence], ["Missing fields", summary.missing], ["Divergences & anomalies", summary.divergences], ["Critical blockers", summary.critical],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-text-tertiary">{label}</dt><dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd></div>)}</dl>
    <p className="text-xs text-text-tertiary">Low confidence: below {LOW_CONFIDENCE_THRESHOLD}%. Confirm reliable fields confirms non-critical fields with AI confidence ≥ {BULK_CONFIRM_THRESHOLD}% and no open issues. Missing confidence is unknown.</p>

    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!globalCount} onClick={() => actions.onBulkConfirm()}>Confirm reliable fields · All quotations ({globalCount})</Button><Button variant="outline" disabled={!selectedCount} onClick={() => selected && actions.onBulkConfirm(selected.id)}>Confirm reliable fields · This quotation ({selectedCount})</Button></div>
    <p role="status" className="text-xs text-text-tertiary">{globalCount} fields will be confirmed across all quotations; {criticalLeft} critical fields still need individual confirmation.</p>
    <div role="group" aria-label="Review issue filters" className="flex flex-wrap gap-2">{filters.map(([key, label, count]) => <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} aria-pressed={filter === key} className="h-auto min-h-11 whitespace-normal" onClick={() => { setFilter(key); resetView(); }}>{label} ({count})</Button>)}</div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><Field label="Search supplier, quote ID or field"><input className={control} value={search} onChange={(e) => { setSearch(e.target.value); resetView(); }} placeholder="Supplier, quote or field name" /></Field><Field label="Sort pending items"><select className={control} value={sort} onChange={(e) => setSort(e.target.value as "severity" | "supplier")}><option value="severity">Severity first</option><option value="supplier">Supplier</option></select></Field></div>
    <div className="flex flex-wrap items-center gap-3 text-sm" role="status"><span>{filter === "ready" ? quotations.length : filter === "confirmed" ? confirmedResults.length : allItems.length} results · {filters.find(([key]) => key === filter)?.[1]}{search && ` · Search: ${search}`}</span>{(filter !== "all" || search) && <Button variant="ghost" className="min-h-11" onClick={() => { setFilter("all"); setSearch(""); resetView(); }}>Clear filters</Button>}</div>
    {filter === "ready" && <div className="divide-y divide-border-subtle">{quotations.length ? quotations.map((q) => <div key={q.documentId} className="space-y-1 py-3 text-sm"><p className="text-success">{q.supplier} · Buyer validated · Ready for comparison</p><p className="text-text-secondary">{q.reason}</p></div>) : <p className="py-4 text-sm">No quotations match these filters.</p>}</div>}
    <div className="max-h-[480px] space-y-0 overflow-y-auto border-t border-border-subtle">
      {filter === "ready" ? null : filter === "confirmed" ? confirmedResults.length ? (viewAll ? confirmedResults : confirmedResults.slice(0, 8)).map(({ d, f }) => <div key={`${d.id}-${f.key}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-3"><span className="text-sm text-success">{summary.quotations.find((q) => q.documentId === d.id)?.supplier} · {f.label} · Confirmed</span><Button size="sm" variant="ghost" onClick={() => onFocus(d.id, f.key)}><Pencil />Edit value</Button></div>) : <p className="py-4 text-sm text-text-tertiary">No confirmed fields yet.</p> : items.length ? items.map((i) => <details key={i.id} className="border-b border-border-subtle py-3">
        <summary className="cursor-pointer text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"><span className={i.kind === "critical" ? "text-error" : i.kind === "unconfirmed" ? "text-text-secondary" : "text-warning"}>{i.supplier} · {i.field.label} · {i.kind === "low_confidence" ? "Low confidence" : i.kind === "critical" ? "Blocker" : i.kind === "unconfirmed" ? "Unconfirmed" : i.kind === "missing" ? "Missing" : "Divergence"}</span>{i.followUp && <span className="ml-2 text-warning">Follow-up</span>}</summary>
        <div className="mt-3 space-y-3 text-xs"><Button className="h-auto max-w-full whitespace-normal text-left" size="sm" variant="ghost" onClick={() => onFocus(i.documentId, i.field.key)}><Pencil />{i.fileName} · {i.field.label}</Button><dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-text-tertiary">Original extracted value</dt><dd className="break-words">{formatReviewValue(i.originalValue)}</dd></div><div><dt className="text-text-tertiary">Reviewed value</dt><dd className="break-words">{formatReviewValue(i.reviewedValue)}</dd></div><div><dt className="text-text-tertiary">AI confidence</dt><dd>{i.confidence == null ? "Not provided" : `${i.confidence}%`}</dd></div></dl><p>{i.reason}</p><p className="text-text-tertiary">{i.expectedAction}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => actions.onFieldConfirm(i.documentId, i.field.key)}><Check />Confirm value</Button><Button size="sm" variant="ghost" onClick={() => onFocus(i.documentId, i.field.key)}><Pencil />Edit value</Button><Button size="sm" variant="ghost" onClick={() => actions.onReset(i.documentId, i.field.key)}><RotateCcw />Restore extracted value</Button><Button size="sm" variant="ghost" aria-pressed={i.followUp} onClick={() => actions.onFollowUp(i.documentId, i.field.key)}><Flag />{i.followUp ? "Clear follow-up" : "Mark for follow-up"}</Button></div></div>
      </details>) : <p className="py-4 text-sm text-text-tertiary">No pending items in this filter.</p>}
    </div>
    {!viewAll && (filter === "confirmed" ? confirmedResults.length : allItems.length) > 8 && <Button variant="outline" className="min-h-11" onClick={() => setViewAll(true)}>View all ({filter === "confirmed" ? confirmedResults.length : allItems.length})</Button>}
    <details className="border-t border-border-subtle pt-4"><summary className="min-h-11 cursor-pointer text-sm font-medium">Quotation readiness ({summary.quotations.length})</summary><div className="divide-y divide-border-subtle">{quotations.map((q) => <div key={q.documentId} className="py-3 text-sm"><p className={q.canProceed ? "text-success" : "text-warning"}>{q.supplier} · {q.canProceed ? "Buyer validated · Ready for comparison" : "Awaiting buyer validation"}</p><p className="text-xs text-text-secondary">{q.reason}</p></div>)}</div></details>
  </Section>;
}