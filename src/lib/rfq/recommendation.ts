import { decisionInsights, validWeights, type Intelligence, type Weights } from "./intelligence";
import { classifyEligibility } from "./eligibility";
import type { RfqReference } from "./types";
import { DEMO_BUYER } from "./audit";
import { canCompare, type QuoteDocument } from "./workflow";
import type { AuditEvent } from "./review-types";
export const RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT =
  "RFQ recommendation after buyer quotation confirmation measured";
/** One milestone per retained RFQ audit; calculation remains gated by buyer review. */
export function shouldMeasureBuyerConfirmedRecommendation(
  documents: QuoteDocument[],
  reference: RfqReference,
  weights: Weights,
  audit: AuditEvent[],
): boolean {
  if (
    audit.some((e) => e.action === RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT) ||
    !canCompare(documents, reference) ||
    !validWeights(weights)
  ) return false;
  return Boolean(decisionInsights(compareDocuments(documents, reference, weights), reference).recommended);
}
export const ROBUSTNESS_TOOLTIP = "Robust: score lead ≥ 10 points and absolute cost gap ≥ 3%. Moderate: score lead ≥ 5 points and absolute cost gap ≥ 1%. Otherwise Sensitive. With no eligible alternative: Sensitive (no competitive comparison). These are deterministic indicators, not a weight-sensitivity simulation.";
export type WhyNotCategory = "disqualified_by_blocker" | "higher_total_cost" | "lower_score" | "relevant_risk" | "expired_quote" | "missing_certification_or_requirement";
export const REASON_LABELS: Record<WhyNotCategory, string> = { disqualified_by_blocker: "Disqualified by blocker", higher_total_cost: "Higher total cost", lower_score: "Lower score", relevant_risk: "Relevant risk", expired_quote: "Expired quotation", missing_certification_or_requirement: "Missing certification or requirement" };
export function recommendationRobustness(scoreGap: number | null, costGapPercent: number | null): "Robust" | "Moderate" | "Sensitive" {
  return scoreGap != null && costGapPercent != null && scoreGap >= 10 && Math.abs(costGapPercent) >= 3 ? "Robust" : scoreGap != null && costGapPercent != null && scoreGap >= 5 && Math.abs(costGapPercent) >= 1 ? "Moderate" : "Sensitive";
}
const money = (n: number) => `USD ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export function explainRecommendation(list: Intelligence[], reference: RfqReference, weights: Weights) {
  const insight = decisionInsights(list, reference);
  const recommended = validWeights(weights) ? insight.recommended : null;
  const eligible = list.filter((a) => a.eligible && a.score != null && a !== recommended).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.annualLanded ?? Infinity) - (b.annualLanded ?? Infinity));
  const next = eligible[0] ?? null;
  const nextSavings = next?.annualLanded != null && recommended?.annualLanded != null ? next.annualLanded - recommended.annualLanded : null;
  const nextPercent = nextSavings != null && next?.annualLanded ? nextSavings / next.annualLanded * 100 : null;
  const scoreGap = next?.score != null && recommended?.score != null ? recommended.score - next.score : null;
  // Thresholds intentionally describe observed gaps only, not simulated scenario stability.
  const robustness = recommendationRobustness(scoreGap, nextPercent);
  const winFactors: string[] = [];
  if (recommended) {
    const peers = [recommended, ...eligible];
    const lowest = Math.min(...peers.map((a) => a.annualLanded ?? Infinity));
    if (recommended.annualLanded === lowest) winFactors.push(`Lowest eligible annual landed cost: ${money(lowest)}.`);
    else if (recommended.annualLanded != null) winFactors.push(`Annual landed cost ${money(recommended.annualLanded)}; premium over lowest eligible cost ${money(recommended.annualLanded - lowest)} is balanced by the weighted score.`);
    const leads = peers.flatMap((a) => a.baseline.quote.lead_time_days == null ? [] : [a.baseline.quote.lead_time_days]);
    const payments = peers.flatMap((a) => a.baseline.quote.payment_terms_days == null ? [] : [a.baseline.quote.payment_terms_days]);
    winFactors.push(`Lead time: ${recommended.baseline.quote.lead_time_days == null ? "Not provided" : `${recommended.baseline.quote.lead_time_days} days`}; best eligible: ${leads.length ? `${Math.min(...leads)} days` : "Not provided"}.`);
    winFactors.push(`Mandatory requirements met: part ${reference.partNumber}, revision ${reference.revision}, certification ${reference.requiredCertification}, valid on ${reference.today}.`);
    winFactors.push(`Payment terms: ${recommended.baseline.quote.payment_terms_days == null ? "Not provided" : `${recommended.baseline.quote.payment_terms_days} days`}; best eligible: ${payments.length ? `${Math.max(...payments)} days` : "Not provided"}.`);
    winFactors.push(`Final score: ${recommended.score?.toFixed(1)}/100${scoreGap == null ? "; no eligible alternative with a score" : `; ${scoreGap.toFixed(1)} points ahead of ${next?.name}`}.`);
    if (insight.why) winFactors.push(insight.why);
    const cheapestUnit = [...list].filter((a) => a.baseline.unitPriceUsd != null).sort((a, b) => (a.baseline.unitPriceUsd ?? Infinity) - (b.baseline.unitPriceUsd ?? Infinity))[0];
    if (cheapestUnit && cheapestUnit !== recommended) winFactors.push(`${cheapestUnit.name} has the lowest unit price (${money(cheapestUnit.baseline.unitPriceUsd ?? 0)}), but annual landed cost is ${cheapestUnit.annualLanded == null ? "Not provided" : money(cheapestUnit.annualLanded)}. Unit price alone does not determine the award.`);
  }
  const perSupplier = list.filter((a) => a !== recommended).map((a) => {
    const eligibility = classifyEligibility(a, a.document);
    const reasons: { category: WhyNotCategory; text: string }[] = [];
    if (!a.eligible) {
      reasons.push(...eligibility.blockers.map((text) => ({ category: "disqualified_by_blocker" as const, text })));
      for (const alert of a.baseline.alerts.filter((x) => x.code === "EXPIRED" || x.code === "CERTIFICATION")) reasons.push({ category: alert.code === "EXPIRED" ? "expired_quote" : "missing_certification_or_requirement", text: alert.message });
    } else if (recommended) {
      if (a.annualLanded != null && recommended.annualLanded != null && a.annualLanded > recommended.annualLanded) reasons.push({ category: "higher_total_cost", text: `${money(a.annualLanded)} annually; ${money(a.annualLanded - recommended.annualLanded)} more than ${recommended.name}.` });
      if (a.score != null && recommended.score != null) reasons.push({ category: "lower_score", text: `${a.score.toFixed(1)}/100 versus ${recommended.score.toFixed(1)}/100; gap ${(recommended.score - a.score).toFixed(1)} points${a.score === recommended.score ? "; lower landed cost breaks the tie" : ""}.` });
      reasons.push(...eligibility.caveats.map((text) => ({ category: "relevant_risk" as const, text })));
    }
    return { supplier: a, eligibility, reasons };
  });
  return { recommended, annualLanded: recommended?.annualLanded ?? null, incumbentSavings: insight.savings, incumbentPercent: insight.reduction, baselineLabel: insight.baselineLabel, next, nextSavings, nextPercent, scoreGap, robustness, eligibility: recommended ? classifyEligibility(recommended, recommended.document) : null, winFactors, risks: recommended ? classifyEligibility(recommended, recommended.document).caveats : [], perSupplier };
}
export interface ApprovedDecision { supplierId: string; supplier: string; recommendedSupplier: string; override: boolean; justification: string; weights: Weights; timestamp: string; actor: string }
export function decisionErrors(list: Intelligence[], recommended: Intelligence | null, selectedId: string, justification: string, weights: Weights): string[] {
  const errors: string[] = [];
  const selected = list.find((a) => a.document.id === selectedId);
  if (!recommended || !validWeights(weights)) errors.push("A valid recommendation and scoring weights are required.");
  if (!selected?.eligible || !selected.document.confirmed) errors.push("Select a buyer-confirmed eligible supplier.");
  if (selected && recommended && selected !== recommended && justification.trim().length < 20) errors.push("An override requires a written justification of at least 20 characters.");
  return errors;
}
export function createApprovedDecision(list: Intelligence[], reference: RfqReference, weights: Weights, supplierId: string, justification: string, timestamp: string): ApprovedDecision {
  const recommended = explainRecommendation(list, reference, weights).recommended;
  const errors = decisionErrors(list, recommended, supplierId, justification, weights);
  if (errors.length) throw new Error(errors.join(" "));
  const supplier = list.find((a) => a.document.id === supplierId);
  if (!supplier || !recommended) throw new Error("No eligible decision is available.");
  return { supplierId, supplier: supplier.name, recommendedSupplier: recommended.name, override: supplier !== recommended, justification: justification.trim(), weights: { ...weights }, timestamp, actor: DEMO_BUYER };
}
export function costChartDomain(list: Intelligence[], unit = false): [number, number] { return [0, Math.max(1, ...list.map((a) => (unit ? a.baseline.unitPriceUsd : a.annualLanded) ?? 0)) * 1.12]; }