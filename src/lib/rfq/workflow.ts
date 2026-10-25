import type { ExtractedQuote, RfqReference } from "./types";
import { DEFAULT_INCOTERM_ADDERS } from "./rules";

export const MAX_FILES = 20;
export const FILE_TYPES = ["pdf", "xlsx", "xls", "csv", "txt"];
export type RfqStatus = "Draft" | "Analyzing" | "Completed" | "Under Negotiation" | "Awarded";
export interface QuoteDocument {
  id: string;
  text: string;
  fileName: string;
  fileType: string;
  pdfBase64?: string | undefined;
  status: "Uploading" | "Ready" | "Processing" | "Extracted" | "Needs Review" | "Error";
  error?: string | undefined;
  original?: ExtractedQuote | undefined;
  reviewed?: ExtractedQuote | undefined;
  confirmed: boolean;
}
export const newReference = (): RfqReference => ({
  rfqNumber: "", partNumber: "", revision: "", annualVolume: 12,
  requiredCertification: "AS9100D", usdBrl: 5.1447, eurBrl: 5.9186,
  incotermAdders: { ...DEFAULT_INCOTERM_ADDERS }, today: "",
  description: "", category: "", requiredDeliveryDate: "", deliveryLocation: "",
  currency: "USD", incumbentSupplier: "", targetCost: null,
});
export function referenceErrors(ref: RfqReference): string[] {
  const errors: string[] = [];
  for (const [label, value] of [["RFQ number", ref.rfqNumber], ["Part number", ref.partNumber], ["Revision", ref.revision], ["Required certification", ref.requiredCertification], ["Today's date", ref.today]]) {
    if (!value?.trim()) errors.push(`${label} is required.`);
  }
  if (!(Number.isFinite(ref.annualVolume) && ref.annualVolume > 0 && Number.isInteger(ref.annualVolume))) errors.push("Annual volume must be a positive whole number.");
  if (![ref.usdBrl, ref.eurBrl].every((x) => Number.isFinite(x) && x > 0)) errors.push("Exchange rates must be positive numbers.");
  if (Object.values(ref.incotermAdders).some((x) => !Number.isFinite(x) || x < 0)) errors.push("Freight and insurance adders must be non-negative numbers.");
  if (ref.currency && !["USD", "EUR", "BRL"].includes(ref.currency)) errors.push("Invalid RFQ currency.");
  if (ref.today && !/^\d{4}-\d{2}-\d{2}$/.test(ref.today)) errors.push("Invalid analysis date.");
  if (ref.targetCost != null && (!Number.isFinite(ref.targetCost) || ref.targetCost < 0)) errors.push("Target cost must be a non-negative number.");
  return errors;
}
export function quoteErrors(q: ExtractedQuote): string[] {
  const errors: string[] = [];
  if (!q.supplier_name?.trim()) errors.push("Supplier name is required.");
  if (!q.part_number?.trim()) errors.push("Part number is required.");
  if (!q.revision?.trim()) errors.push("Revision is required.");
  if (!q.currency || !["USD", "EUR", "BRL"].includes(q.currency)) errors.push("A valid currency is required.");
  if (q.unit_price == null || !Number.isFinite(q.unit_price) || q.unit_price < 0) errors.push("A valid unit price is required.");
  for (const key of ["moq", "quantity_basis", "lead_time_days", "payment_terms_days", "warranty_months", "freight", "insurance", "duties", "other_adders"] as const) {
    const value = q[key];
    if (value != null && (!Number.isFinite(value) || value < 0)) errors.push(`${key.replaceAll("_", " ")} must be a non-negative number.`);
  }
  if (q.price_breaks.some((x) => !Number.isFinite(x.min_qty) || x.min_qty < 0 || !Number.isFinite(x.unit_price) || x.unit_price < 0)) errors.push("Invalid price break.");
  if (q.one_time_costs.some((x) => !Number.isFinite(x.amount) || x.amount < 0 || (x.currency != null && !["USD", "EUR", "BRL"].includes(x.currency)))) errors.push("Invalid one-time cost.");
  return errors;
}
export function confidenceLevel(value: number | null | undefined) {
  return value == null ? "Not provided" : value >= 90 ? "High" : value >= 70 ? "Medium" : "Review Required";
}
export function averageConfidence(q: ExtractedQuote): number | null {
  const values = Object.values(q.confidence ?? {}).filter((x): x is number => x != null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function canCompare(documents: QuoteDocument[], ref: RfqReference) {
  return referenceErrors(ref).length === 0 && documents.length > 0 && documents.every((d) => d.confirmed && d.reviewed && quoteErrors(d.reviewed).length === 0 && d.status === "Extracted");
}
/** Local calendar date (YYYY-MM-DD), not UTC: after 21:00 in Brazil UTC is already tomorrow. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/**
 * Bulk extraction (no id) only queues untouched documents: Ready or Error.
 * Already extracted or buyer-edited documents are re-extracted only via the per-row Reprocess button (id given).
 */
export function extractQueue(documents: QuoteDocument[], id?: string): QuoteDocument[] {
  const hasContent = (d: QuoteDocument) => Boolean(d.text.trim() || d.pdfBase64) && d.status !== "Uploading";
  if (id) return documents.filter((d) => d.id === id && hasContent(d));
  return documents.filter((d) => (d.status === "Ready" || d.status === "Error") && hasContent(d));
}

export const REVIEW_FIELDS: { key: keyof ExtractedQuote; label: string; kind: "text" | "number" | "boolean" | "json" | "certifications" }[] = [
  { key: "supplier_name", label: "Supplier", kind: "text" },
  { key: "quote_id", label: "Quote ID", kind: "text" },
  { key: "part_number", label: "Part number", kind: "text" },
  { key: "revision", label: "Revision", kind: "text" },
  { key: "currency", label: "Currency", kind: "text" },
  { key: "unit_price", label: "Unit price", kind: "number" },
  { key: "moq", label: "MOQ", kind: "number" },
  { key: "quantity_basis", label: "Annual volume", kind: "number" },
  { key: "price_breaks", label: "Price breaks (JSON)", kind: "json" },
  { key: "lead_time_days", label: "Lead time (days)", kind: "number" },
  { key: "incoterm", label: "Incoterm", kind: "text" },
  { key: "incoterm_place", label: "Incoterm place", kind: "text" },
  { key: "payment_terms_days", label: "Payment terms (days)", kind: "number" },
  { key: "quote_date", label: "Quote date", kind: "text" },
  { key: "validity_end_date", label: "Quote validity", kind: "text" },
  { key: "one_time_costs", label: "Tooling / NRE / FAI (JSON)", kind: "json" },
  { key: "freight", label: "Annual freight (quote currency)", kind: "number" },
  { key: "insurance", label: "Annual insurance (quote currency)", kind: "number" },
  { key: "duties", label: "Annual duties (quote currency)", kind: "number" },
  { key: "other_adders", label: "Annual other adders (quote currency)", kind: "number" },
  { key: "certifications", label: "Certification (comma-separated)", kind: "certifications" },
  { key: "fai_included", label: "FAI included", kind: "boolean" },
  { key: "eccn", label: "ECCN", kind: "text" },
  { key: "country_of_origin", label: "Country of origin", kind: "text" },
  { key: "delivery_location", label: "Delivery location", kind: "text" },
  { key: "warranty_months", label: "Warranty (months)", kind: "number" },
  { key: "new_supplier_requires_qualification", label: "New supplier requires qualification", kind: "boolean" },
  { key: "surcharge_clause", label: "Escalation clause", kind: "text" },
  { key: "commercial_exceptions", label: "Commercial exceptions", kind: "text" },
  { key: "notes", label: "Notes", kind: "text" },
];