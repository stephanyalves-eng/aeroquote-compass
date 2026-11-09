import { useState } from "react";
import { Check, Pencil, RotateCcw, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REVIEW_FIELDS, type QuoteDocument } from "@/lib/rfq/workflow";
import { reviewSummary, fieldConfirmed, formatReviewValue, reliableFields, CRITICAL_FIELDS, LOW_CONFIDENCE_THRESHOLD, BULK_CONFIRM_THRESHOLD } from "@/lib/rfq/review-issues";
import type { ReviewField } from "@/lib/rfq/review-types";
import type { RfqReference } from "@/lib/rfq/types";
import { Section } from "./primitives";

export interface ReviewActions {
  onFieldConfirm: (id: string, field: ReviewField) => void;
  onFollowUp: (id: string, field: ReviewField) => void;
  onBulkConfirm: (id?: string) => void;
  onReset: (id: string, field: ReviewField) => void;
}
export function ReviewPending({ documents, reference, selectedId, onFocus, ...actions }: ReviewActions & { documents: QuoteDocument[]; reference: RfqReference; selectedId?: string | undefined; onFocus: (id: string, field: ReviewField) => void }) {
  const [filter, setFilter] = useState("all");
  const summary = reviewSummary(documents, reference);
  const confirmed = documents.flatMap((d) => d.reviewed ? REVIEW_FIELDS.filter((f) => fieldConfirmed(d, f.key)).map((f) => ({ d, f })) : []);
  const filters = [
    ["all", "All", summary.issues.length], ["review", "Requires review", summary.issues.length],
    ["low_confidence", "Low confidence", summary.lowConfidence], ["missing", "Missing fields", summary.missing],
    ["divergence", "Divergences", summary.divergences], ["critical", "Critical blockers", summary.critical], ["confirmed", "Confirmed", confirmed.length],
  ] as const;
  const items = summary.issues.filter((i) => filter === "all" || filter === "review" || i.kind === filter);
  const globalCount = documents.reduce((n, d) => n + reliableFields(d, documents, reference).length, 0);
  const selected = documents.find((d) => d.id === selectedId);
  const selectedCount = selected ? reliableFields(selected, documents, reference).length : 0;
  const criticalLeft = documents.reduce((n, d) => n + (d.reviewed ? CRITICAL_FIELDS.filter((key) => !fieldConfirmed(d, key)).length : 0), 0);
  return <Section title="Review pending items" action={<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Buyer verification</span>}>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">{[
      ["Total quotations", summary.total], ["Quotations confirmed", summary.confirmed], ["Requiring review", summary.requiringReview], ["Confirmed fields", summary.confirmedFields],
      ["Low-confidence fields", summary.lowConfidence], ["Missing fields", summary.missing], ["Divergences & anomalies", summary.divergences], ["Critical blockers", summary.critical],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-text-tertiary">{label}</dt><dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd></div>)}</dl>
    <p className="text-xs text-text-tertiary">Low confidence: below {LOW_CONFIDENCE_THRESHOLD}%. Confirm reliable fields confirms non-critical fields with AI confidence ≥ {BULK_CONFIRM_THRESHOLD}% and no open issues. Missing confidence is unknown.</p>
    <div className="space-y-2 border-y border-border-subtle py-4">{summary.quotations.map((q) => <div key={q.documentId} className="text-sm"><span className={q.canProceed ? "text-success" : "text-warning"}>{q.supplier} · {q.canProceed ? "Ready for comparison" : "Awaiting review"}</span><p className="text-xs text-text-tertiary">{q.reason}</p></div>)}</div>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!globalCount} onClick={() => actions.onBulkConfirm()}>Confirm reliable fields · All quotations ({globalCount})</Button><Button variant="outline" disabled={!selectedCount} onClick={() => selected && actions.onBulkConfirm(selected.id)}>Confirm reliable fields · This quotation ({selectedCount})</Button></div>
    <p role="status" className="text-xs text-text-tertiary">{globalCount} fields will be confirmed across all quotations; {criticalLeft} critical fields still need individual confirmation.</p>
    <div role="group" aria-label="Review issue filters" className="flex flex-wrap gap-2">{filters.map(([key, label, count]) => <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({count})</Button>)}</div>
    <div className="max-h-[480px] space-y-0 overflow-y-auto border-t border-border-subtle">
      {filter === "confirmed" ? confirmed.length ? confirmed.map(({ d, f }) => <div key={`${d.id}-${f.key}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-3"><span className="text-sm text-success">{summary.quotations.find((q) => q.documentId === d.id)?.supplier} · {f.label} · Confirmed</span><Button size="sm" variant="ghost" onClick={() => onFocus(d.id, f.key)}><Pencil />Edit value</Button></div>) : <p className="py-4 text-sm text-text-tertiary">No confirmed fields yet.</p> : items.length ? items.map((i) => <details key={i.id} className="border-b border-border-subtle py-3">
        <summary className="cursor-pointer text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"><span className={i.kind === "critical" ? "text-error" : i.kind === "unconfirmed" ? "text-text-secondary" : "text-warning"}>{i.supplier} · {i.field.label} · {i.kind === "low_confidence" ? "Low confidence" : i.kind === "critical" ? "Blocker" : i.kind === "unconfirmed" ? "Unconfirmed" : i.kind === "missing" ? "Missing" : "Divergence"}</span>{i.followUp && <span className="ml-2 text-warning">Follow-up</span>}</summary>
        <div className="mt-3 space-y-3 text-xs"><Button className="h-auto max-w-full whitespace-normal text-left" size="sm" variant="ghost" onClick={() => onFocus(i.documentId, i.field.key)}><Pencil />{i.fileName} · {i.field.label}</Button><dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-text-tertiary">Original extracted value</dt><dd className="break-words">{formatReviewValue(i.originalValue)}</dd></div><div><dt className="text-text-tertiary">Reviewed value</dt><dd className="break-words">{formatReviewValue(i.reviewedValue)}</dd></div><div><dt className="text-text-tertiary">AI confidence</dt><dd>{i.confidence == null ? "Not provided" : `${i.confidence}%`}</dd></div></dl><p>{i.reason}</p><p className="text-text-tertiary">{i.expectedAction}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => actions.onFieldConfirm(i.documentId, i.field.key)}><Check />Confirm value</Button><Button size="sm" variant="ghost" onClick={() => onFocus(i.documentId, i.field.key)}><Pencil />Edit value</Button><Button size="sm" variant="ghost" onClick={() => actions.onReset(i.documentId, i.field.key)}><RotateCcw />Restore extracted value</Button><Button size="sm" variant="ghost" aria-pressed={i.followUp} onClick={() => actions.onFollowUp(i.documentId, i.field.key)}><Flag />{i.followUp ? "Clear follow-up" : "Mark for follow-up"}</Button></div></div>
      </details>) : <p className="py-4 text-sm text-text-tertiary">No pending items in this filter.</p>}
    </div>
  </Section>;
}