import type { Intelligence } from "./intelligence";
import type { QuoteDocument } from "./workflow";
import { averageConfidence } from "./workflow";
import type { EligibilityStatus } from "./review-types";
export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = { eligible: "Eligible", eligible_with_caveats: "Eligible with caveats", not_eligible: "Not eligible", awaiting_review: "Awaiting review" };
export function classifyEligibility(intelligence: Intelligence | null, document: QuoteDocument) {
  const blockers: string[] = [], caveats: string[] = [];
  if (!document.confirmed || !document.reviewed || !intelligence) return { status: "awaiting_review" as EligibilityStatus, blockers, caveats: ["Buyer confirmation is required before calculation."] };
  blockers.push(...intelligence.anomalies.filter((a) => a.critical).map((a) => a.message));
  if (intelligence.incomplete) blockers.push("No logistics information or applicable Incoterm estimate is available.");
  if (intelligence.risk === "Insufficient data") blockers.push("Required risk / compliance information is incomplete.");
  if (!intelligence.eligible && !blockers.length) blockers.push("Quotation is not awardable under the current requirements.");
  const q = document.reviewed;
  caveats.push(...intelligence.baseline.alerts.filter((a) => a.severity === "MEDIUM").map((a) => a.message));
  caveats.push(...intelligence.anomalies.filter((a) => !a.critical && /understated|required delivery|commercial exceptions/i.test(a.message)).map((a) => a.message));
  if ((averageConfidence(q) ?? 100) < 70 || Object.values(document.original?.confidence ?? {}).some((n) => n != null && n < 70)) caveats.push("Low AI confidence: buyer-verified source values require continued attention.");
  return { status: (!intelligence.eligible ? "not_eligible" : caveats.length || intelligence.risk === "Medium" ? "eligible_with_caveats" : "eligible") as EligibilityStatus, blockers: [...new Set(blockers)], caveats: [...new Set(caveats)] };
}