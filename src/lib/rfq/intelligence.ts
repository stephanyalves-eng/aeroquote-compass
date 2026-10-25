import { analyzeQuote, daysBetween, toUsd } from "./rules";
import { normalizeSupplierName, sameSupplier } from "./supplier-name";
import { averageConfidence } from "./workflow";
import type { QuoteDocument } from "./workflow";
import type { QuoteAnalysis, RfqReference } from "./types";

export const DEFAULT_WEIGHTS = { cost: 40, leadTime: 20, risk: 15, payment: 10, compliance: 10, commercial: 5 };
export type Weights = typeof DEFAULT_WEIGHTS;
export const CRITERIA: Record<keyof Weights, string> = { cost: "Total Cost", leadTime: "Lead Time", risk: "Supplier Risk", payment: "Payment Terms", compliance: "Certification / Compliance", commercial: "Commercial Conditions" };
export const validWeights = (w: Weights) => Object.values(w).every((v) => Number.isFinite(v) && v >= 0 && v <= 100) && Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) <= 0.01;
export interface Intelligence {
  document: QuoteDocument;
  baseline: QuoteAnalysis;
  name: string;
  fictitious: boolean;
  material: number | null;
  freight: number | null;
  insurance: number | null;
  combinedEstimate: number | null;
  duties: number | null;
  other: number | null;
  oneTime: number;
  annualLanded: number | null;
  unitLanded: number | null;
  estimated: boolean;
  incomplete: boolean;
  risk: "Low" | "Medium" | "High" | "Insufficient data";
  riskScore: number | null;
  eligible: boolean;
  score: number | null;
  contributions: { key: keyof Weights; value: number | null; weighted: number | null; reason: string }[];
  anomalies: { message: string; critical: boolean }[];
  costRank: number;
}
export function landedAnalysis(document: QuoteDocument, ref: RfqReference, index: number): Intelligence | null {
  if (!document.confirmed || !document.reviewed) return null;
  const q = document.reviewed;
  const baseline = analyzeQuote(q, ref, index);
  const supplier = normalizeSupplierName(q.supplier_name, document.text);
  const convert = (v: number | null | undefined) => v == null ? null : toUsd(v, q.currency, ref);
  const freight = convert(q.freight), insurance = convert(q.insurance);
  // Legacy adder remains combined: never invent a freight/insurance split.
  const combinedEstimate = freight === null && insurance === null ? baseline.freightUsd : null;
  const duties = convert(q.duties), other = convert(q.other_adders);
  const estimated = combinedEstimate !== null && combinedEstimate > 0;
  // Quoting only freight or only insurance is a non-critical warning, not a blocker.
  const partialLogistics = (freight == null) !== (insurance == null);
  // Eligibility is blocked only when there is no logistics information at all AND the Incoterm adder cannot be applied.
  const incomplete = freight == null && insurance == null && combinedEstimate == null;
  const annualLanded = baseline.annualGoodsUsd == null ? null : baseline.annualGoodsUsd + (freight ?? 0) + (insurance ?? 0) + (combinedEstimate ?? 0) + (duties ?? 0) + (other ?? 0) + baseline.oneTimeUsd;
  const insufficient = !q.certifications.length || q.lead_time_days == null || !q.validity_end_date || !q.part_number || !q.revision;
  const mismatch = Boolean(q.part_number && q.part_number.trim().toUpperCase() !== ref.partNumber.trim().toUpperCase());
  const confidence = averageConfidence(q);
  const late = Boolean(ref.requiredDeliveryDate && q.lead_time_days != null && daysBetween(ref.today, ref.requiredDeliveryDate) < q.lead_time_days);
  const risk = baseline.risk === "High" || mismatch ? "High" : insufficient ? "Insufficient data" : baseline.risk === "Medium" || late || q.commercial_exceptions || (confidence != null && confidence < 70) || incomplete ? "Medium" : "Low";
  const anomalies = baseline.alerts.map((a) => ({ message: a.message, critical: a.severity === "HIGH" }));
  if (mismatch) anomalies.push({ message: `Part number ${q.part_number} does not match ${ref.partNumber}.`, critical: true });
  if (partialLogistics) anomalies.push({ message: `${q.insurance == null ? "Insurance" : "Freight"} not quoted; landed cost may be understated.`, critical: false });
  if (!partialLogistics && q.freight == null) anomalies.push({ message: "Freight information is missing; combined Incoterm adder shown separately when available.", critical: false });
  if (!partialLogistics && q.insurance == null) anomalies.push({ message: "Insurance information is missing; no independent insurance charge assumed.", critical: false });
  if (late) anomalies.push({ message: "Quoted lead time exceeds the required delivery date.", critical: false });
  if (!q.country_of_origin) anomalies.push({ message: "Country of origin not provided; country risk not assessed.", critical: false });
  if (q.commercial_exceptions) anomalies.push({ message: `Commercial exceptions: ${q.commercial_exceptions}`, critical: false });
  return { document, baseline, name: supplier.name ?? "Not provided", fictitious: supplier.isFictitious, material: baseline.annualGoodsUsd,
    freight, insurance, combinedEstimate, duties, other, oneTime: baseline.oneTimeUsd, annualLanded,
    unitLanded: annualLanded == null ? null : annualLanded / ref.annualVolume, estimated, incomplete, risk,
    riskScore: risk === "Insufficient data" ? null : risk === "High" ? 100 : risk === "Medium" ? 50 : 0,
    eligible: baseline.awardable && !mismatch && risk !== "Insufficient data" && !incomplete,
    score: null, contributions: [], anomalies, costRank: 0 };
}
export function compareDocuments(documents: QuoteDocument[], ref: RfqReference, weights: Weights): Intelligence[] {
  const list = documents.map((d, i) => landedAnalysis(d, ref, i)).filter((a): a is Intelligence => a !== null)
    .sort((a, b) => (a.annualLanded ?? Infinity) - (b.annualLanded ?? Infinity));
  const costs = list.map((a) => a.annualLanded).filter((x): x is number => x != null);
  const mean = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  const minCost = costs.length ? Math.min(...costs) : null;
  const maxCost = costs.length ? Math.max(...costs) : null;
  const leads = list.map((a) => a.baseline.quote.lead_time_days).filter((x): x is number => x != null);
  const minLead = leads.length ? Math.min(...leads) : null;
  const maxLead = leads.length ? Math.max(...leads) : null;
  const payments = list.map((a) => a.baseline.quote.payment_terms_days).filter((x): x is number => x != null);
  const minPayment = payments.length ? Math.min(...payments) : null;
  const maxPayment = payments.length ? Math.max(...payments) : null;
  // Min-max normalisation: best value = 100, worst = 0, linear in between; equal values all score 100.
  const minMax = (v: number | null, min: number | null, max: number | null, lowerIsBetter: boolean): number | null => {
    if (v == null || min == null || max == null) return null;
    if (max === min) return 100;
    const ratio = (v - min) / (max - min);
    return Math.min(100, Math.max(0, (lowerIsBetter ? 1 - ratio : ratio) * 100));
  };
  for (const [index, a] of list.entries()) {
    a.costRank = index + 1;
    const q = a.baseline.quote;
    if (costs.length >= 3 && mean != null && mean > 0 && a.annualLanded != null) {
      const difference = (a.annualLanded / mean - 1) * 100;
      if (Math.abs(difference) >= 15) a.anomalies.push({ message: `Annual landed cost is ${Math.abs(difference).toFixed(1)}% ${difference > 0 ? "above" : "below"} the supplier average (15% threshold).`, critical: false });
    }
    // Revision is excluded: the REVISION alert against the requested revision already covers it.
    const peerChecks: { key: "currency" | "incoterm" | "payment_terms_days"; label: string; unit: string; message: (v: unknown, mode: unknown) => string }[] = [
      { key: "currency", label: "currency", unit: "", message: (v, m) => `Uses ${v} while most suppliers quote ${m}.` },
      { key: "incoterm", label: "Incoterm", unit: "", message: (v, m) => `Uses ${v} while most suppliers use ${m}.` },
      { key: "payment_terms_days", label: "payment terms", unit: " days", message: (v, m) => `Payment terms of ${v} days while most suppliers offer ${m} days.` },
    ];
    for (const { key, label, unit, message } of peerChecks) {
      const all = list.map((b) => b.baseline.quote[key]).filter((x) => x != null);
      if (!all.length) continue;
      const counts = new Map<unknown, number>();
      for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
      const modeEntry = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
      if (!modeEntry || q[key] == null || q[key] === modeEntry[0]) continue;
      const [mode, count] = modeEntry;
      // Keep the denominator explicit for pluralities (including the 2-of-4 sample).
      // Missing values are not votes; a strict majority must exceed half the known values.
      a.anomalies.push({ message: count > all.length / 2
        ? message(q[key], mode)
        : `${label === "payment terms" ? "Payment terms of" : label === "Incoterm" ? "Incoterm" : "Currency"} ${q[key]}${unit} ${label === "payment terms" ? "differ" : "differs"} from the most common ${label} among peers (${mode}${unit}, ${count} of ${all.length}).`, critical: false });
    }
    const moqs = list.filter((b) => b !== a).map((b) => b.baseline.quote.moq).filter((x): x is number => x != null && x > 0);
    const avgMoq = moqs.length ? moqs.reduce((s, v) => s + v, 0) / moqs.length : null;
    if (q.moq != null && avgMoq != null && (q.moq > avgMoq * 2 || q.moq < avgMoq / 2)) a.anomalies.push({ message: "MOQ differs by more than 2× from the peer average.", critical: false });
    const values: Record<keyof Weights, number | null> = {
      cost: minMax(a.annualLanded, minCost, maxCost, true),
      leadTime: minMax(q.lead_time_days, minLead, maxLead, true),
      risk: a.riskScore == null ? null : 100 - a.riskScore,
      payment: minMax(q.payment_terms_days, minPayment, maxPayment, false),
      compliance: q.certifications.length ? (a.baseline.alerts.some((x) => x.code === "CERTIFICATION" || x.code === "REVISION") || a.anomalies.some((x) => x.message.startsWith("Part number")) ? 0 : 100) : null,
      commercial: q.payment_terms_days == null || q.warranty_months == null ? null : Math.max(0, 100 - (q.surcharge_clause ? 40 : 0) - (q.commercial_exceptions ? 40 : 0) - (q.one_time_costs.length ? 20 : 0)),
    };
    const reasons: Record<keyof Weights, string> = { cost: "Min-max normalisation across compared suppliers: lowest annual landed cost = 100, highest = 0, linear in between; equal costs score 100", leadTime: "Min-max normalisation: shortest lead time = 100, longest = 0, linear in between; equal lead times score 100", risk: "100 − risk score; Low 0, Medium 50, High 100", payment: "Min-max normalisation: longest payment terms = 100, shortest = 0, linear in between; equal terms score 100", compliance: "100 when required certification, revision and part comply; otherwise 0", commercial: "100 − surcharge 40 − exceptions 40 − separate one-time charges 20" };
    a.contributions = (Object.keys(weights) as (keyof Weights)[]).map((key) => ({ key, value: values[key], weighted: values[key] == null ? null : values[key] * weights[key] / 100, reason: reasons[key] }));
    a.score = validWeights(weights) && a.contributions.every((c) => weights[c.key] === 0 || c.weighted != null) ? a.contributions.reduce((s, c) => s + (c.weighted ?? 0), 0) : null;
  }
  return list;
}
function whyRecommended(recommended: Intelligence, list: Intelligence[], eligible: Intelligence[]): string {
  const traits: string[] = [];
  const eligibleCosts = eligible.map((a) => a.annualLanded).filter((x): x is number => x != null);
  if (recommended.annualLanded != null && eligibleCosts.length && recommended.annualLanded === Math.min(...eligibleCosts)) traits.push("the lowest annual landed cost among eligible suppliers");
  const leads = list.map((a) => a.baseline.quote.lead_time_days).filter((x): x is number => x != null);
  if (recommended.baseline.quote.lead_time_days != null && leads.length && recommended.baseline.quote.lead_time_days === Math.min(...leads)) traits.push("the shortest lead time");
  const risks = list.map((a) => a.riskScore).filter((x): x is number => x != null);
  if (recommended.riskScore != null && risks.length && recommended.riskScore === Math.min(...risks)) traits.push("the lowest risk");
  const payments = list.map((a) => a.baseline.quote.payment_terms_days).filter((x): x is number => x != null);
  if (recommended.baseline.quote.payment_terms_days != null && payments.length && recommended.baseline.quote.payment_terms_days === Math.max(...payments)) traits.push("the best payment terms");
  const parts: string[] = [traits.length
    ? `${recommended.name} holds ${traits.length > 1 ? `${traits.slice(0, -1).join(", ")} and ${traits[traits.length - 1]}` : traits[0]}, and reaches the highest weighted score among eligible, buyer-confirmed quotations.`
    : `${recommended.name} reaches the highest weighted score among eligible, buyer-confirmed quotations.`];
  const costs = list.map((a) => a.annualLanded).filter((x): x is number => x != null);
  const lowest = costs.length ? Math.min(...costs) : null;
  if (lowest != null && recommended.annualLanded != null && recommended.annualLanded > lowest) {
    const cheapest = list.find((a) => a.annualLanded === lowest);
    if (cheapest && cheapest !== recommended) {
      const reasons = cheapest.anomalies.filter((x) => x.critical).map((x) => x.message);
      const cause = reasons.length ? reasons.join(" ") : cheapest.incomplete ? "Logistics information is incomplete and the Incoterm adder cannot be applied." : "It is not awardable.";
      parts.push(`${cheapest.name} has the lowest annual landed cost but is not awardable: ${cause} Choosing ${recommended.name} adds a premium of USD ${Math.round(recommended.annualLanded - lowest).toLocaleString("en-US")} per year.`);
    }
  }
  return parts.join(" ");
}
export function decisionInsights(list: Intelligence[], ref: RfqReference) {
  const eligible = list.filter((a) => a.eligible && a.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.annualLanded ?? Infinity) - (b.annualLanded ?? Infinity));
  const recommended = eligible[0] ?? null;
  const costs = list.map((a) => a.annualLanded).filter((x): x is number => x != null);
  const incumbent = ref.incumbentSupplier ? list.find((a) => sameSupplier(a.name, ref.incumbentSupplier)) : undefined;
  const target = ref.targetCost == null ? null : toUsd(ref.targetCost, ref.currency ?? "USD", ref);
  const baseline = incumbent?.annualLanded ?? target;
  const savings = baseline == null || recommended?.annualLanded == null ? null : baseline - recommended.annualLanded;
  return { recommended, lowest: costs.length ? Math.min(...costs) : null, average: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    baseline, baselineLabel: incumbent?.annualLanded != null ? "Incumbent quote" : target != null ? "Annual target cost" : "Not provided",
    savings, reduction: savings == null || baseline == null || baseline === 0 ? null : savings / baseline * 100,
    difference: recommended?.annualLanded == null || !costs.length ? null : recommended.annualLanded - Math.min(...costs),
    why: recommended ? whyRecommended(recommended, list, eligible) : null,
    costAvoidance: null };
}