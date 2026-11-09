import type { RfqReference } from "./types";
import type { QuoteDocument } from "./workflow";
import { REVIEW_FIELDS } from "./workflow";
import { CRITERIA, decisionInsights, type Intelligence, type Weights } from "./intelligence";
import { explainRecommendation, REASON_LABELS, type ApprovedDecision } from "./recommendation";
import { buildLandedCostBreakdown, SOURCE_LABELS } from "./landed-cost";
import { classifyEligibility, ELIGIBILITY_LABELS } from "./eligibility";
import { PO_TOLERANCE_FIELDS, poSummary, purchaseOrderStatus } from "./po-check";
import type { PoState } from "./po-types";
import type { ConfigurationSnapshot } from "./revisions";
import type { TimelineEvent } from "./audit-timeline";
import { humanValue, sameValue } from "./summary-values";
import { normalizeSupplierName } from "./supplier-name";

export interface SummarySection { title: string; sheet: string; columns: string[]; rows: string[][] }
export const NOT_RECORDED = "Not yet recorded";
export const DISCLAIMER = "Synthetic sample data for portfolio purposes. No real company data. Fictional demo users; no real authentication.";
const usd = (n: number | null | undefined) => n == null ? "Not provided" : `USD ${Math.round(n).toLocaleString("en-US")}`;
const TREATMENT: Record<string, string> = { first_year_full: "Included in full in year one", amortized: "Amortized", recurring: "Recurring annual", excluded_later_years: "Excluded in later years" };
const REF_LABELS: [keyof RfqReference, string][] = [["rfqNumber", "RFQ number"], ["partNumber", "Part number"], ["revision", "Requested revision"], ["description", "Description"], ["annualVolume", "Annual volume (units)"], ["requiredCertification", "Required certification"], ["usdBrl", "USD/BRL exchange rate"], ["eurBrl", "EUR/BRL exchange rate"], ["today", "Analysis date"], ["requiredDeliveryDate", "Required delivery date"], ["deliveryLocation", "Delivery location"], ["incumbentSupplier", "Incumbent supplier"]];
const SUMMARY_FIELDS = ["supplier_name", "quote_id", "part_number", "revision", "currency", "unit_price", "quantity_basis", "incoterm", "lead_time_days", "payment_terms_days", "validity_end_date", "certifications", "freight", "insurance", "duties", "one_time_costs"] as const;

export interface SummaryInput { reference: RfqReference; documents: QuoteDocument[]; list: Intelligence[]; weights: Weights; approvedDecision?: ApprovedDecision | undefined; poState?: PoState | undefined; poApproved?: boolean; snapshots: readonly ConfigurationSnapshot[]; timeline: TimelineEvent[] }
/** Pure: assembles every auditable section with human labels only. Missing decision / PO → "Not yet recorded". */
export function buildDecisionSummary(i: SummaryInput): SummarySection[] {
  const { reference: ref, list, weights } = i, out: SummarySection[] = [];
  const sec = (title: string, sheet: string, columns: string[], rows: string[][], empty = NOT_RECORDED) => out.push({ title, sheet, columns, rows: rows.length ? rows : [[empty, ...columns.slice(1).map(() => "")]] });
  const name = (d: QuoteDocument) => normalizeSupplierName(d.reviewed?.supplier_name ?? d.original?.supplier_name ?? null, d.text).name ?? d.fileName;
  sec("RFQ header", "RFQ", ["Field", "Value"], [["Disclaimer", DISCLAIMER], ...REF_LABELS.map(([k, l]) => [l, humanValue(ref[k])]), ["Freight / insurance adders", Object.entries(ref.incotermAdders).map(([k, v]) => `${k} ${v}%`).join(" | ")], ["Synthetic demo analysis", ref.demoAnalysis ? "Yes" : "No"]]);
  sec("Reviewed data per supplier", "Reviewed data", ["Supplier", "Field", "Original extraction", "Reviewed value", "Changed by buyer"], i.documents.flatMap((d) => SUMMARY_FIELDS.map((k) => { const f = REVIEW_FIELDS.find((x) => x.key === k)!; const o = d.original?.[k], r = d.reviewed?.[k]; return [name(d), f.label, humanValue(o), humanValue(r), sameValue(o, r) ? "No" : "Yes"]; })));
  sec("Supplier comparison", "Comparison", ["Supplier", "Unit price USD", "Annual landed USD", "Lead time", "Payment terms", "Risk", "Eligibility", "Overall score"], list.map((a) => [a.name, usd(a.baseline.unitPriceUsd), usd(a.annualLanded), a.baseline.quote.lead_time_days == null ? "Not provided" : `${a.baseline.quote.lead_time_days} days`, a.baseline.quote.payment_terms_days == null ? "Not provided" : `${a.baseline.quote.payment_terms_days} days`, a.risk, ELIGIBILITY_LABELS[classifyEligibility(a, a.document).status], a.score == null ? "Not provided" : a.score.toFixed(1)]), "No quotation confirmed for comparison");
  sec("Landed-cost composition", "Landed cost", ["Supplier", "Component", "Original", "FX to USD", "USD", "Source", "Treatment", "Formula / note"], list.flatMap((a) => { const b = buildLandedCostBreakdown(a, { reference: ref });
    return [...(b.validationErrors.length ? b.validationErrors.map((e) => [a.name, "Validation", e, "", "", "", "", ""]) : b.components.map((c) => [a.name, c.label, `${c.currencyOriginal} ${Math.round(c.amountOriginal).toLocaleString("en-US")}`, c.fxRate.toFixed(4), usd(c.amountUsd), SOURCE_LABELS[c.source], c.treatment ? TREATMENT[c.treatment] ?? "" : "", `${c.formula}${c.note ? ` · ${c.note}` : ""}`])),
      [a.name, "Annual landed total", "", "", usd(b.annualTotal), "Calculated", "", b.formula]]; }), "No quotation confirmed for comparison");
  sec("Scores and weight breakdown", "Scoring", ["Supplier", "Criterion", "Weight %", "Score", "Weighted contribution", "Explanation"], list.flatMap((a) => a.contributions.map((c) => [a.name, CRITERIA[c.key], String(weights[c.key]), c.value == null ? "Not provided" : c.value.toFixed(1), c.weighted == null ? "Not provided" : c.weighted.toFixed(1), c.reason])), "No scores calculated");
  sec("Risks and eligibility", "Eligibility", ["Supplier", "Eligibility", "Risk", "Blockers", "Caveats / risks"], i.documents.map((d) => { const a = list.find((x) => x.document.id === d.id) ?? null, e = classifyEligibility(a, d); return [name(d), ELIGIBILITY_LABELS[e.status], a?.risk ?? "Not calculated", e.blockers.join("; ") || "None", e.caveats.join("; ") || "None"]; }));
  const ins = decisionInsights(list, ref), ex = explainRecommendation(list, ref, weights);
  sec("Recommendation and explanation", "Recommendation", ["Item", "Value"], list.length ? [["Recommended supplier", ins.recommended?.name ?? "No eligible supplier"], ["Annual landed cost", usd(ins.recommended?.annualLanded)], ["Overall score", ins.recommended?.score?.toFixed(1) ?? "Not provided"], ["Savings vs " + ins.baselineLabel, usd(ins.savings)], ["Robustness", ex.robustness], ["Next eligible alternative", ex.next?.name ?? "No eligible alternative"],
    ...ex.winFactors.map((t) => ["Why this supplier", t]), ...ex.risks.map((t) => ["Risk / point of attention", t]), ...ex.perSupplier.flatMap((p) => p.reasons.map((r) => [`${p.supplier.name}: ${REASON_LABELS[r.category]}`, r.text]))] : []);
  const dcs = i.approvedDecision;
  sec("Recorded decision", "Decision", ["Item", "Value"], dcs ? [["Selected supplier", dcs.supplier], ["Recommended supplier", dcs.recommendedSupplier], ["Override of recommendation", dcs.override ? "Yes" : "No"], ["Justification", dcs.justification || "None given"], ["Weights at decision", Object.entries(dcs.weights).map(([k, v]) => `${CRITERIA[k as keyof Weights]} ${v}%`).join(", ")], ["Decided by", dcs.actor], ["Timestamp", dcs.timestamp]] : []);
  const po = i.poState, r = po?.result;
  sec("PO Check result", "PO Check", ["Item", "Value"], po?.po && r ? [["PO number", po.po.poNumber], ["Supplier", po.po.supplier], ["Status", purchaseOrderStatus(po, i.poApproved ?? true)], ["Confirmed checks", String(poSummary(r, po.resolutions).confirmed)], ["Discrepancies", String(poSummary(r, po.resolutions).discrepancies)], ["Blockers", String(poSummary(r, po.resolutions).blockers)], ["Released", po.released ? "Yes" : "No"],
    ...PO_TOLERANCE_FIELDS.map((f) => [`Tolerance: ${f.label}`, String(r.tolerances[f.key])]), ...po.resolutions.map((x) => [`Buyer resolution: ${r.items.find((it) => it.id === x.itemId)?.fieldLabel ?? "Check"}`, `${x.action === "accepted" ? "Accepted" : "Correction requested"} · ${x.justification} · ${x.actor} · ${x.timestamp}`])] : []);
  sec("PO discrepancy table", "PO discrepancies", ["Field", "Approved value", "PO value", "Absolute difference", "Difference %", "Annual impact USD", "Reference source", "Severity", "Status", "Recommended action"], r ? r.items.filter((x) => x.status !== "confirmed" && x.status !== "not_applicable").map((x) => [x.fieldLabel, humanValue(x.approvedValue), humanValue(x.poValue), x.absoluteDifference == null ? "—" : humanValue(Math.round(x.absoluteDifference * 100) / 100), x.percentDifference == null ? "—" : `${x.percentDifference.toFixed(2)}%`, usd(x.financialImpactUsd), x.referenceSource, x.severity, x.status === "blocker" ? "Blocker" : "Requires review", x.recommendedAction]) : [], r ? "No discrepancies" : NOT_RECORDED);
  sec("Revision snapshots used by checks", "Snapshots", ["Date", "Check", "Actor", "Supplier", "Drawing", "Drawing rev", "Specification", "RFQ version", "Quote rev", "Expected", "Found", "Result", "Divergences", "Final status"], i.snapshots.map((s) => [s.timestamp, s.checkType, s.actor, s.supplier, s.drawingNumber, s.drawingRevision ?? "Not provided", `${s.specificationId} v${s.specificationVersion ?? "?"}`, s.rfqVersion ?? "Not provided", s.quoteRevision ?? "Not provided", s.expectedRevision ?? "Not provided", s.foundRevision ?? "Not provided", s.result, s.divergences.join("; ") || "None", s.finalStatus]));
  sec("Audit timeline", "Audit timeline", ["Timestamp", "Event", "Stage", "Document", "Revision", "Actor", "Supplier", "Result", "Details"], i.timeline.map((e) => [e.timestamp, e.type, e.stage, e.document, e.revision, e.actor, e.supplier, e.result, e.impact]));
  return out;
}
export function summaryCsv(sections: SummarySection[]): string {
  const cell = (v: string) => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return sections.map((s) => [s.title, s.columns.map(cell).join(","), ...s.rows.map((r) => r.map(cell).join(","))].join("\n")).join("\n\n");
}
