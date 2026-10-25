import type { QuoteAnalysis, RfqReference } from "./types";
import { normalizeSupplierName } from "./supplier-name";

export function draftClarificationEmail(a: QuoteAnalysis, ref: RfqReference, sourceText = ""): string {
  const q = a.quote;
  const supplier = normalizeSupplierName(q.supplier_name, sourceText);
  const asks = a.alerts.map((al, i) => {
    switch (al.code) {
      case "REVISION": return `${i + 1}. Revision: your quote references Rev ${q.revision}; our RFQ requires Rev ${ref.revision}. Please requote against Rev ${ref.revision}.`;
      case "CERTIFICATION": return `${i + 1}. Certification: please confirm a valid ${ref.requiredCertification} certificate and send a copy.`;
      case "ECCN": return `${i + 1}. Export classification: please confirm the ECCN and any license requirement for export to Brazil.`;
      case "QUALIFICATION": return `${i + 1}. Qualification: please outline the qualification plan (samples, FAI) and its timeline and cost.`;
      case "EXPIRED": return `${i + 1}. Validity: the quote expired on ${q.validity_end_date}. Please reissue with a new validity date.`;
      case "EXPIRING": return `${i + 1}. Validity: the quote expires on ${q.validity_end_date}. Please extend validity by at least 60 days.`;
      case "ONE_TIME_COST": return `${i + 1}. One-time charges: ${al.message} Please confirm whether this can be waived or amortized into the unit price.`;
      case "FAI": return `${i + 1}. FAI: please confirm whether FAI (AS9102) is included and, if not, its cost.`;
      case "SURCHARGE": return `${i + 1}. Price adjustment: please remove the surcharge clause or define a cap and index reference.`;
      case "LEAD_TIME": return `${i + 1}. Lead time: ${q.lead_time_days} days exceeds our 120-day target. Please advise the best achievable lead time.`;
      default: return `${i + 1}. ${al.message}`;
    }
  });
  return [
    `Subject: ${ref.rfqNumber} - Clarification request on quote ${q.quote_id ?? ""}`.trim(),
    "",
    `Dear ${supplier.name ?? "Supplier"}${supplier.isFictitious ? " (Fictitious)" : ""} team,`,
    "",
    `Thank you for your quotation ${q.quote_id ?? ""} for ${ref.partNumber} Rev ${ref.revision} (${ref.annualVolume} units/year). Before we can complete our evaluation, please address the points below:`,
    "",
    ...(asks.length ? asks : ["No open points. Please confirm the quote remains valid."]),
    "",
    "Please send a revised quotation or written confirmation at your earliest convenience.",
    "",
    "Best regards,",
    "[Your name]",
    "Procurement",
  ].join("\n");
}
