import type { RfqReference } from "./types";
import { referenceErrors } from "./workflow";
/** Field-level view of referenceErrors (same messages, same order) so the form can tie each message to its input. */
export type ReferenceField =
  | "rfqNumber" | "partNumber" | "revision" | "annualVolume" | "requiredCertification"
  | "targetCost" | "usdBrl" | "eurBrl" | "today" | "currency" | "incotermAdders";
const MATCH: [RegExp, ReferenceField[]][] = [
  [/^RFQ number/, ["rfqNumber"]],
  [/^Part number/, ["partNumber"]],
  [/^Revision/, ["revision"]],
  [/^Required certification/, ["requiredCertification"]],
  [/^Today's date|analysis date/i, ["today"]],
  [/^Annual volume/, ["annualVolume"]],
  [/^Exchange rates/, ["usdBrl", "eurBrl"]],
  [/^Freight and insurance/, ["incotermAdders"]],
  [/currency/i, ["currency"]],
  [/^Target cost/, ["targetCost"]],
];
/** Display order of fields in RFQ Setup, used to focus the first invalid one. */
export const REFERENCE_FIELD_ORDER: ReferenceField[] = [
  "rfqNumber", "partNumber", "revision", "annualVolume", "requiredCertification",
  "targetCost", "currency", "usdBrl", "eurBrl", "today", "incotermAdders",
];
export function referenceFieldErrors(ref: RfqReference): Partial<Record<ReferenceField, string>> {
  const out: Partial<Record<ReferenceField, string>> = {};
  for (const message of referenceErrors(ref)) {
    const fields = MATCH.find(([re]) => re.test(message))?.[1] ?? [];
    for (const f of fields) out[f] ??= message;
  }
  return out;
}
export function firstInvalidField(ref: RfqReference): ReferenceField | null {
  const errs = referenceFieldErrors(ref);
  return REFERENCE_FIELD_ORDER.find((f) => errs[f]) ?? null;
}
