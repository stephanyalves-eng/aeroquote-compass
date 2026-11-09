import { reliableFields, fieldConfirmed, BULK_CONFIRM_THRESHOLD } from "./review-issues";
import { CRITICAL_FIELDS } from "./review-types";
import { REVIEW_FIELDS, type QuoteDocument } from "./workflow";
import type { RfqReference } from "./types";

const label = (key: string) => REVIEW_FIELDS.find((f) => f.key === key)?.label ?? "Field";
/** Preview shown before a bulk confirmation; critical fields are never included. */
export function bulkConfirmPlan(documents: QuoteDocument[], ref: RfqReference, id?: string) {
  const targets = documents.filter((d) => d.reviewed && !d.excluded && (!id || d.id === id)).map((d) => ({ id: d.id, fields: reliableFields(d, documents, ref) }));
  const affected = targets.filter((t) => t.fields.length);
  return {
    targets: affected,
    quotations: affected.length,
    fields: affected.reduce((n, t) => n + t.fields.length, 0),
    excluded: CRITICAL_FIELDS.map(label),
    criticalPending: documents.filter((d) => d.reviewed && !d.excluded && (!id || d.id === id)).reduce((n, d) => n + CRITICAL_FIELDS.filter((k) => !fieldConfirmed(d, k)).length, 0),
    rule: `Only non-critical fields with AI confidence of at least ${BULK_CONFIRM_THRESHOLD}%, no open issue and no follow-up flag are confirmed. Fields with divergences and all critical fields always need individual confirmation.`,
  };
}
