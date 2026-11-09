import { REVIEW_FIELDS, quoteErrors, type QuoteDocument } from "./workflow";
import { computeAlerts, daysBetween } from "./rules";
import { normalizeSupplierName } from "./supplier-name";
import type { ExtractedQuote, RfqReference } from "./types";
import type { ReviewField, ReviewIssue } from "./review-types";
import { CRITICAL_FIELDS } from "./review-types";
export { CRITICAL_FIELDS } from "./review-types";

export const LOW_CONFIDENCE_THRESHOLD = 70;
export const BULK_CONFIRM_THRESHOLD = 90;
const optional = new Set<ReviewField>(["notes", "commercial_exceptions", "surcharge_clause"]);
const order = { critical: 0, missing: 1, low_confidence: 2, divergence: 3, unconfirmed: 4 };
const empty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
export const sameReviewValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function fieldConfirmed(d: QuoteDocument, key: ReviewField): boolean {
  return d.fieldStatus?.[key]?.confirmed ?? (d.fieldStatus == null && d.confirmed);
}
export function reviewInputId(documentId: string, field: ReviewField): string { return `review-${encodeURIComponent(documentId)}-${field}`; }
export function formatReviewValue(value: unknown): string {
  if (empty(value)) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((v) => typeof v === "object" && v != null ? Object.entries(v).map(([k, n]) => `${k === "min_qty" ? "Minimum quantity" : k === "unit_price" ? "Unit price" : k === "amount" ? "Amount" : k === "currency" ? "Currency" : "Type"}: ${n ?? "Not provided"}`).join(" · ") : String(v)).join("; ");
  return String(value);
}
function invalidFields(q: ExtractedQuote): Set<ReviewField> {
  const invalid = new Set<ReviewField>();
  for (const key of ["supplier_name", "part_number", "revision"] as const) if (!q[key]?.trim()) invalid.add(key);
  if (!q.currency || !["USD", "EUR", "BRL"].includes(q.currency)) invalid.add("currency");
  if (q.unit_price == null || !Number.isFinite(q.unit_price) || q.unit_price < 0) invalid.add("unit_price");
  for (const f of REVIEW_FIELDS.filter((f) => f.kind === "number")) { const v = q[f.key]; if (typeof v === "number" && (!Number.isFinite(v) || v < 0)) invalid.add(f.key); }
  if (q.price_breaks.some((b) => !Number.isFinite(b.min_qty) || b.min_qty < 0 || !Number.isFinite(b.unit_price) || b.unit_price < 0)) invalid.add("price_breaks");
  if (q.one_time_costs.some((c) => !Number.isFinite(c.amount) || c.amount < 0 || (c.currency != null && !["USD", "EUR", "BRL"].includes(c.currency)))) invalid.add("one_time_costs");
  return invalid;
}
export function reviewIssues(documents: QuoteDocument[], ref: RfqReference): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const d of documents) {
    const q = d.reviewed; if (!q || !d.original) continue;
    const invalid = invalidFields(q);
    const blockers = new Map<ReviewField, string>();
    for (const key of invalid) blockers.set(key, "Invalid or required value. Comparison is blocked until corrected.");
    const codes: Record<string, ReviewField> = { REVISION: "revision", CERTIFICATION: "certifications", EXPIRED: "validity_end_date" };
    for (const a of computeAlerts(q, ref)) { const key = codes[a.code]; if (key) blockers.set(key, `${a.message} Award is blocked; confirm an accurate extraction to include this quotation in comparison.`); }
    if (q.part_number && q.part_number.trim().toUpperCase() !== ref.partNumber.trim().toUpperCase()) blockers.set("part_number", `Part number differs from requested ${ref.partNumber}. Award is blocked; an accurate extraction may be confirmed for comparison.`);
    for (const f of REVIEW_FIELDS) {
      const value = q[f.key], confidence = d.original.confidence?.[f.key] ?? null, confirmed = fieldConfirmed(d, f.key);
      const add = (kind: ReviewIssue["kind"], reason: string, expectedAction: string) => issues.push({ id: `${d.id}:${f.key}:${kind}`, documentId: d.id, supplier: normalizeSupplierName(q.supplier_name, d.text).name ?? "Not provided", fileName: d.fileName, field: { key: f.key, label: f.label }, originalValue: d.original?.[f.key], reviewedValue: value, confidence, kind, reason, expectedAction, followUp: d.fieldStatus?.[f.key]?.followUp ?? false });
      const blocker = blockers.get(f.key);
      if (blocker) add("critical", blocker, invalid.has(f.key) ? "Correct the value before comparison." : "Confirm source accuracy or correct the quotation; resolve before award.");
      // An individual confirmation acknowledges source accuracy, not award eligibility.
      if (confirmed) continue;
      const missing = empty(value) && !optional.has(f.key);
      const lowConfidence = confidence != null && confidence < LOW_CONFIDENCE_THRESHOLD;
      if (missing) add("missing", `${f.label} is not provided.`, "Check the source; enter the value or confirm that it is not stated.");
      if (lowConfidence) add("low_confidence", `AI confidence is below ${LOW_CONFIDENCE_THRESHOLD}%.`, "Check against the source and individually confirm the value.");
      const reasons: string[] = [];
      if (!sameReviewValue(value, d.original[f.key])) reasons.push("Buyer-edited value has not been confirmed.");
      if (f.key === "currency" && q.currency && ref.currency && q.currency !== ref.currency) reasons.push(`Quotation uses ${q.currency}; RFQ uses ${ref.currency}.`);
      if (f.key === "moq" && q.moq != null && q.moq > ref.annualVolume) reasons.push(`MOQ ${q.moq} exceeds annual volume ${ref.annualVolume}.`);
      if (f.key === "lead_time_days" && q.lead_time_days != null && ref.requiredDeliveryDate && q.lead_time_days > daysBetween(ref.today, ref.requiredDeliveryDate)) reasons.push("Quoted lead time exceeds the required delivery date.");
      if (["currency", "incoterm", "payment_terms_days"].includes(f.key) && !empty(value)) {
        const values = documents.flatMap((x) => x.reviewed && !empty(x.reviewed[f.key]) ? [x.reviewed[f.key]] : []);
        const counts = new Map<string, number>(); for (const v of values) { const k = String(v).trim().toUpperCase(); counts.set(k, (counts.get(k) ?? 0) + 1); }
        const modes = [...counts.entries()].sort((a, b) => b[1] - a[1]); const mode = modes[0];
        if (mode && mode[1] > (modes[1]?.[1] ?? 0) && String(value).trim().toUpperCase() !== mode[0]) reasons.push(`${f.label} differs from the most common value among received quotations (${mode[0]}, ${mode[1]} of ${values.length}).`);
      }
      if (reasons.length) add("divergence", reasons.join(" "), "Review the difference and confirm source accuracy, edit or flag for follow-up.");
      else if (!blocker && !missing && !lowConfidence) add("unconfirmed", CRITICAL_FIELDS.includes(f.key) ? "Critical field requires individual buyer confirmation." : "Value has not been confirmed.", "Confirm the value after checking the source.");
    }
  }
  return issues.sort((a, b) => order[a.kind] - order[b.kind] || a.supplier.localeCompare(b.supplier) || REVIEW_FIELDS.findIndex((f) => f.key === a.field.key) - REVIEW_FIELDS.findIndex((f) => f.key === b.field.key) || a.fileName.localeCompare(b.fileName));
}
export function reliableFields(d: QuoteDocument, documents: QuoteDocument[], ref: RfqReference): ReviewField[] {
  const issues = reviewIssues(documents, ref);
  return REVIEW_FIELDS.filter((f) => !CRITICAL_FIELDS.includes(f.key) && !fieldConfirmed(d, f.key) && !d.fieldStatus?.[f.key]?.followUp && (d.original?.confidence?.[f.key] ?? -1) >= BULK_CONFIRM_THRESHOLD && !issues.some((i) => i.documentId === d.id && i.field.key === f.key && i.kind !== "unconfirmed")).map((f) => f.key);
}
export function quotationConfirmationErrors(d: QuoteDocument): string[] {
  if (!d.reviewed || !d.original) return ["Extraction is not complete."];
  return [...quoteErrors(d.reviewed), ...CRITICAL_FIELDS.filter((key) => !fieldConfirmed(d, key)).map((key) => `Individually confirm ${REVIEW_FIELDS.find((f) => f.key === key)?.label ?? "critical value"}.`)];
}
export function confirmReviewFields(d: QuoteDocument, fields: ReviewField[]): QuoteDocument {
  const fieldStatus = { ...d.fieldStatus };
  for (const key of fields) fieldStatus[key] = { ...fieldStatus[key], confirmed: true };
  return { ...d, fieldStatus };
}
export function editReviewDocument(d: QuoteDocument, q: ExtractedQuote, timestamp: string): QuoteDocument {
  const fieldStatus = { ...d.fieldStatus };
  for (const f of REVIEW_FIELDS) if (!sameReviewValue(d.reviewed?.[f.key], q[f.key])) fieldStatus[f.key] = { ...fieldStatus[f.key], confirmed: false, editedAt: timestamp };
  // Materialize legacy confirmations before the first edit to preserve unaffected fields.
  if (d.fieldStatus == null && d.confirmed) for (const f of REVIEW_FIELDS) if (!fieldStatus[f.key]) fieldStatus[f.key] = { confirmed: true };
  return { ...d, reviewed: q, fieldStatus, confirmed: false, status: "Needs Review" };
}
export function restoreReviewField(d: QuoteDocument, field: ReviewField, timestamp: string): QuoteDocument {
  if (!d.original || !d.reviewed) return d;
  const updated = editReviewDocument(d, { ...d.reviewed, [field]: structuredClone(d.original[field]) }, timestamp);
  return { ...updated, fieldStatus: { ...updated.fieldStatus, [field]: { ...updated.fieldStatus?.[field], confirmed: false, editedAt: timestamp } } };
}
export function toggleReviewFollowUp(d: QuoteDocument, field: ReviewField): QuoteDocument {
  const fieldStatus = { ...d.fieldStatus };
  if (d.fieldStatus == null && d.confirmed) for (const f of REVIEW_FIELDS) fieldStatus[f.key] = { confirmed: true };
  fieldStatus[field] = { ...fieldStatus[field], confirmed: fieldConfirmed(d, field), followUp: !d.fieldStatus?.[field]?.followUp };
  return { ...d, fieldStatus };
}
export function bulkReviewPreview(documents: QuoteDocument[], ref: RfqReference, selectedId?: string) {
  return {
    globalCount: documents.reduce((n, d) => n + reliableFields(d, documents, ref).length, 0),
    selectedCount: documents.filter((d) => d.id === selectedId).reduce((n, d) => n + reliableFields(d, documents, ref).length, 0),
    criticalLeft: documents.reduce((n, d) => n + (d.reviewed ? CRITICAL_FIELDS.filter((key) => !fieldConfirmed(d, key)).length : 0), 0),
  };
}
export const PROCUREMENT_STAGES = ["Quotes received", "AI extraction", "Buyer review", "Comparison & calculation", "Recommendation", "PO creation/upload", "PO Check", "Purchase release"];
export function procurementStages(documents: QuoteDocument[], step: number, busy: boolean, approved = false) {
  const extracted = documents.length > 0 && documents.every((d) => d.original && d.reviewed);
  const confirmed = documents.length > 0 && documents.every((d) => d.confirmed && quotationConfirmationErrors(d).length === 0);
  return PROCUREMENT_STAGES.map((label, i) => ({ label, status: i === 4 && approved && confirmed ? "Confirmed" : i === 5 && approved && confirmed ? "Available" : i >= 5 ? "Later phase" : i === 0 ? (documents.length ? "Received" : "Pending") : i === 1 ? (busy ? "In progress" : extracted ? "Extracted" : "Pending") : i === 2 ? (confirmed ? "Confirmed" : step === 2 ? "In review" : "Pending") : step === 3 && confirmed ? "Available" : "Pending" }));
}
export function reviewSummary(documents: QuoteDocument[], ref: RfqReference) {
  const issues = reviewIssues(documents, ref);
  const quotations = documents.map((d) => { const errors = quotationConfirmationErrors(d); return { documentId: d.id, supplier: normalizeSupplierName(d.reviewed?.supplier_name ?? null, d.text).name ?? d.fileName, canProceed: d.confirmed && d.status === "Extracted" && errors.length === 0, reason: d.confirmed && !errors.length ? "Confirmed for comparison; award eligibility is evaluated separately." : errors[0] ?? "Confirm the quotation to proceed." }; });
  const confirmedFields = documents.reduce((n, d) => n + (d.reviewed ? REVIEW_FIELDS.filter((f) => fieldConfirmed(d, f.key)).length : 0), 0);
  return { issues, quotations, total: documents.length, confirmed: quotations.filter((q) => q.canProceed).length, requiringReview: quotations.filter((q) => !q.canProceed).length, confirmedFields, lowConfidence: issues.filter((i) => i.kind === "low_confidence").length, missing: issues.filter((i) => i.kind === "missing").length, divergences: issues.filter((i) => i.kind === "divergence").length, critical: issues.filter((i) => i.kind === "critical").length };
}