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
  const leads = list.map((a) => a.baseline.quote.lead_time_days).filter((x): x is number => x != null);
  const minLead = leads.length ? Math.min(...leads) : null;
  const payments = list.map((a) => a.baseline.quote.payment_terms_days).filter((x): x is number => x != null);
  const maxPayment = payments.length ? Math.max(...payments) : null;
  for (const [index, a] of list.entries()) {
    a.costRank = index + 1;
    const q = a.baseline.quote;
    if (costs.length >= 3 && mean != null && mean > 0 && a.annualLanded != null) {
      const difference = (a.annualLanded / mean - 1) * 100;
      if (Math.abs(difference) >= 15) a.anomalies.push({ message: `Annual landed cost is ${Math.abs(difference).toFixed(1)}% ${difference > 0 ? "above" : "below"} the supplier average (15% threshold).`, critical: false });
    }
    for (const key of ["currency", "incoterm", "payment_terms_days", "revision"] as const) {
      const peers = list.filter((b) => b !== a).map((b) => b.baseline.quote[key]).filter((x) => x != null);
      if (q[key] != null && peers.some((v) => v !== q[key])) a.anomalies.push({ message: `${key.replaceAll("_", " ")}: ${q[key]} differs from peer quotations.`, critical: false });
    }
    const moqs = list.filter((b) => b !== a).map((b) => b.baseline.quote.moq).filter((x): x is number => x != null && x > 0);
    const avgMoq = moqs.length ? moqs.reduce((s, v) => s + v, 0) / moqs.length : null;
    if (q.moq != null && avgMoq != null && (q.moq > avgMoq * 2 || q.moq < avgMoq / 2)) a.anomalies.push({ message: "MOQ differs by more than 2× from the peer average.", critical: false });
    const values: Record<keyof Weights, number | null> = {
      cost: a.annualLanded == null || minCost == null ? null : a.annualLanded === 0 ? 100 : Math.min(100, minCost / a.annualLanded * 100),
      leadTime: q.lead_time_days == null || minLead == null ? null : q.lead_time_days === 0 ? 100 : Math.min(100, minLead / q.lead_time_days * 100),
      risk: a.riskScore == null ? null : 100 - a.riskScore,
      payment: q.payment_terms_days == null || maxPayment == null ? null : maxPayment === 0 ? 100 : q.payment_terms_days / maxPayment * 100,
      compliance: q.certifications.length ? (a.baseline.alerts.some((x) => x.code === "CERTIFICATION" || x.code === "REVISION") || a.anomalies.some((x) => x.message.startsWith("Part number")) ? 0 : 100) : null,
      commercial: q.payment_terms_days == null || q.warranty_months == null ? null : Math.max(0, 100 - (q.surcharge_clause ? 40 : 0) - (q.commercial_exceptions ? 40 : 0) - (q.one_time_costs.length ? 20 : 0)),
    };
    const reasons: Record<keyof Weights, string> = { cost: "Lowest peer annual landed cost ÷ supplier annual landed cost × 100", leadTime: "Shortest peer lead time ÷ supplier lead time × 100", risk: "100 − risk score; Low 0, Medium 50, High 100", payment: "Supplier payment days ÷ longest peer payment days × 100", compliance: "100 when required certification, revision and part comply; otherwise 0", commercial: "100 − surcharge 40 − exceptions 40 − separate one-time charges 20" };
    a.contributions = (Object.keys(weights) as (keyof Weights)[]).map((key) => ({ key, value: values[key], weighted: values[key] == null ? null : values[key] * weights[key] / 100, reason: reasons[key] }));
    a.score = validWeights(weights) && a.contributions.every((c) => weights[c.key] === 0 || c.weighted != null) ? a.contributions.reduce((s, c) => s + (c.weighted ?? 0), 0) : null;
  }
  return list;
}
export function decisionInsights(list: Intelligence[], ref: RfqReference) {
  const eligible = list.filter((a) => a.eligible && a.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.annualLanded ?? Infinity) - (b.annualLanded ?? Infinity));
  const recommended = eligible[0] ?? null;
  const costs = list.map((a) => a.annualLanded).filter((x): x is number => x != null);
  const incumbent = ref.incumbentSupplier ? list.find((a) => a.name.toLowerCase() === normalizeSupplierName(ref.incumbentSupplier).name?.toLowerCase()) : undefined;
  const target = ref.targetCost == null ? null : toUsd(ref.targetCost, ref.currency ?? "USD", ref);
  const baseline = incumbent?.annualLanded ?? target;
  const savings = baseline == null || recommended?.annualLanded == null ? null : baseline - recommended.annualLanded;
  return { recommended, lowest: costs.length ? Math.min(...costs) : null, average: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    baseline, baselineLabel: incumbent?.annualLanded != null ? "Incumbent quote" : target != null ? "Annual target cost" : "Not provided",
    savings, reduction: savings == null || baseline == null || baseline === 0 ? null : savings / baseline * 100,
    difference: recommended?.annualLanded == null || !costs.length ? null : recommended.annualLanded - Math.min(...costs),
    costAvoidance: null };
}