import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw, Flag } from "lucide-react";
import { Section, Supplier, Status, control } from "./primitives";
import { REVIEW_FIELDS, confidenceLevel, quoteErrors, type QuoteDocument } from "@/lib/rfq/workflow";
import type { ExtractedQuote, RfqReference } from "@/lib/rfq/types";
import { ReviewPending, type ReviewActions } from "./review-pending";
import { fieldConfirmed, quotationConfirmationErrors, reviewInputId, LOW_CONFIDENCE_THRESHOLD, formatReviewValue } from "@/lib/rfq/review-issues";
import { ReviewArray } from "./review-array";
import type { ReviewField } from "@/lib/rfq/review-types";
export function Review({ documents, reference, onEdit, onConfirm, onReset, onAllFollowUp, ...actions }: ReviewActions & { documents: QuoteDocument[]; reference: RfqReference; onEdit: (id: string, q: ExtractedQuote) => void; onConfirm: (id: string) => void; onAllFollowUp: (id: string, flagged: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const d = documents.find((x) => x.id === selected) ?? documents.find((x) => x.original);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ id: string; field: ReviewField } | null>(null);
  useEffect(() => { if (!target) return; const input = document.getElementById(reviewInputId(target.id, target.field)); if (input) { input.scrollIntoView({ behavior: "auto", block: "center" }); input.focus(); setTarget(null); } }, [target, selected]);
  const focus = (id: string, field: ReviewField) => { setSelected(id); setTarget({ id, field }); };
  const pending = <ReviewPending documents={documents} reference={reference} selectedId={d?.id} onFocus={focus} onReset={onReset} {...actions} />;
  if (!d?.original || !d.reviewed) return <div className="space-y-6">{pending}<Section title="Review Extracted Data"><p className="text-sm text-muted-foreground">No extracted quotation available.</p></Section></div>;
  const q = d.reviewed;
  const confirmationErrors = quotationConfirmationErrors(d);
  const allFlagged = REVIEW_FIELDS.every((field) => d.fieldStatus?.[field.key]?.followUp);
  return <div className="space-y-6">{pending}<Section title="Review Extracted Data" action={<div className="flex flex-wrap gap-2"><select className={control} value={d.id} aria-label="Quote to review" onChange={(e) => { setSelected(e.target.value); setError(""); }}>{documents.filter((x) => x.original).map((x) => <option key={x.id} value={x.id}>{x.fileName}</option>)}</select></div>}>
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]"><div className="space-y-2"><Supplier name={q.supplier_name} source={d.text} /><div><Status>{d.confirmed ? "Buyer confirmed" : "Needs Review"}</Status></div></div><Button disabled={confirmationErrors.length > 0 || d.confirmed} onClick={() => { onConfirm(d.id); const next = documents.find((x) => x.id !== d.id && x.original && !x.confirmed); if (next) setSelected(next.id); }}><Check />Confirm quotation</Button></div>
    {confirmationErrors.length > 0 && <p className="text-xs text-warning">{confirmationErrors.join(" ")}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" aria-pressed={allFlagged} onClick={() => onAllFollowUp(d.id, !allFlagged)}><Flag />{allFlagged ? "Clear all flags" : "Flag all fields"}</Button>
      <span role="status" className="text-xs text-text-secondary">{REVIEW_FIELDS.filter((field) => d.fieldStatus?.[field.key]?.followUp).length} of {REVIEW_FIELDS.length} fields flagged for follow-up</span>
    </div>
    <div className="review-fields"><table className="w-full text-left text-sm"><thead className="bg-surface-sunken"><tr>{["Field", "Original Quote Value", "Reviewed Value", "AI Confidence", "Field review"].map((x) => <th key={x} className="px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{x}</th>)}</tr></thead><tbody>{REVIEW_FIELDS.map((f) => {
      const original = d.original?.[f.key]; const current = q[f.key]; const conf = d.original?.confidence?.[f.key];
      const display = formatReviewValue;
      const edit = (raw: string) => { try { let v: unknown = raw || null; if (f.kind === "number") v = raw === "" ? null : Number(raw); if (f.kind === "boolean") v = raw === "" ? null : raw === "true"; if (f.kind === "certifications") v = raw.split(",").map((x) => x.trim()).filter(Boolean); if (f.kind === "json") { v = JSON.parse(raw); if (!Array.isArray(v)) throw new Error("Expected an array"); } onEdit(d.id, { ...q, [f.key]: v }); setError(""); } catch { setError(`${f.label}: invalid value.`); } };
      return <tr key={f.key} className={`border-b border-border ${conf != null && conf < LOW_CONFIDENCE_THRESHOLD ? "bg-warning-bg" : ""}`}><td data-label="Field" className="px-3 py-3 text-xs font-medium">{f.label}</td><td data-label="Original quote value" className="max-w-72 break-words px-3 py-3 font-mono text-xs text-muted-foreground">{display(original)}</td><td data-label="Reviewed value" className="min-w-56 px-3 py-3">{f.kind === "boolean" ? <select className={control} id={reviewInputId(d.id, f.key)} aria-label={f.label} value={current == null ? "" : String(current)} onChange={(e) => edit(e.target.value)}><option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option></select> : f.kind === "json" && (f.key === "price_breaks" || f.key === "one_time_costs") ? <ReviewArray id={reviewInputId(d.id, f.key)} field={f.key} quote={q} onChange={(updated) => onEdit(d.id, updated)} /> : <input className={control} type={f.kind === "number" ? "number" : "text"} min={f.kind === "number" ? 0 : undefined} step="any" id={reviewInputId(d.id, f.key)} aria-label={f.label} placeholder="Not provided" value={f.kind === "certifications" && Array.isArray(current) ? current.join(", ") : current == null ? "" : String(current)} onChange={(e) => edit(e.target.value)} />}</td><td data-label="AI confidence" className="px-3 py-3 text-xs"><span className={conf != null && conf < LOW_CONFIDENCE_THRESHOLD ? "text-warning" : "text-muted-foreground"}>{conf == null ? "Not provided" : `${conf}% · ${confidenceLevel(conf)}`}</span></td><td data-label="Field review" className="px-3 py-3"><div className="flex flex-wrap items-center gap-1"><Button size="sm" variant="outline" disabled={fieldConfirmed(d, f.key)} onClick={() => actions.onFieldConfirm(d.id, f.key)}><Check />{fieldConfirmed(d, f.key) ? "Confirmed" : "Confirm value"}</Button><Button variant="ghost" size="icon" title={`Reset ${f.label} to extracted value`} aria-label={`Reset ${f.label}`} onClick={() => onReset(d.id, f.key)}><RotateCcw /></Button></div></td></tr>;
    })}</tbody></table></div>
    {(error || quoteErrors(q).length > 0) && <div className="space-y-1 text-xs text-error">{error && <p>{error}</p>}{quoteErrors(q).map((x) => <p key={x}>{x}</p>)}</div>}
    <p className="text-xs text-muted-foreground">AI confidence is self-reported. Original quotation values remain unchanged.</p>
  </Section></div>;
}