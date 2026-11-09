import { humanValue } from "./audit-describe";
import { REVIEW_FIELDS } from "./workflow";
import type { RfqReference } from "./types";
import { CRITERIA, decisionInsights, type Intelligence, type Weights } from "./intelligence";

import { explainRecommendation, REASON_LABELS } from "./recommendation";
import { buildLandedCostBreakdown, SOURCE_LABELS } from "./landed-cost";
import { classifyEligibility, ELIGIBILITY_LABELS } from "./eligibility";

const value = (x: unknown): string => humanValue(x);
const round2 = (n: number | null): number | null => n == null ? null : Math.round(n * 100) / 100;
const usd = (n: number | null | undefined): string => n == null ? "Not provided" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const score1 = (n: number | null | undefined): string => n == null ? "Not provided" : n.toFixed(1);
const days = (n: number | null | undefined): string => n == null ? "Not provided" : `${n} days`;
// jsPDF standard fonts cannot render ÷ × − ≥; the PDF uses ASCII only.
const ascii = (s: string): string => s.replaceAll("÷", "/").replaceAll("×", "x").replaceAll("−", "-").replaceAll("≥", ">=");

const REF_LABELS: Record<string, string> = {
  demoAnalysis: "Synthetic demo analysis", rfqNumber: "RFQ number", partNumber: "Part number", revision: "Requested revision", annualVolume: "Annual volume (units)",
  requiredCertification: "Required certification", usdBrl: "USD/BRL exchange rate", eurBrl: "EUR/BRL exchange rate",
  incotermAdders: "Freight / insurance adders", today: "Analysis date", description: "Description", category: "Category",
  requiredDeliveryDate: "Required delivery date", deliveryLocation: "Delivery location", currency: "RFQ currency",
  incumbentSupplier: "Incumbent supplier", targetCost: "Annual target cost",
};
const refValue = (k: string, v: unknown): string =>
  k === "incotermAdders" && v != null && typeof v === "object"
    ? Object.entries(v as Record<string, number>).map(([key, pct]) => `${key} ${pct}%`).join(" | ")
    : value(v);

export function exportRows(list: Intelligence[], ref?: RfqReference, weights?: Weights) {
  const explanation = ref && weights ? explainRecommendation(list, ref, weights) : null;
  return list.map((a) => ({ Supplier: a.name, Fictitious: a.fictitious, Currency: a.baseline.quote.currency, "Original unit price": a.baseline.quote.unit_price,
    "Normalized unit price USD": round2(a.baseline.unitPriceUsd), "Annual material USD": round2(a.material), "Quoted annual freight USD": round2(a.freight), "Quoted annual insurance USD": round2(a.insurance),
    "Combined freight / insurance adder USD": round2(a.combinedEstimate), Estimated: a.estimated, Incomplete: a.incomplete, "Duties USD": round2(a.duties), "Other adders USD": round2(a.other), "One-time USD": round2(a.oneTime),
    "Annual landed cost USD": round2(a.annualLanded), "Unit landed cost USD": round2(a.unitLanded), MOQ: a.baseline.quote.moq, "Lead time days": a.baseline.quote.lead_time_days, "Payment days": a.baseline.quote.payment_terms_days,
    Risk: a.risk, "Risk score": a.riskScore, "Overall score": a.score == null ? null : round2(a.score), Awardable: a.eligible, Eligibility: ELIGIBILITY_LABELS[classifyEligibility(a, a.document).status], ...(explanation ? { "Best Overall": a === explanation.recommended, "Decision explanation": a === explanation.recommended ? explanation.winFactors.join(" ") : explanation.perSupplier.find((p) => p.supplier === a)?.reasons.map((r) => `${REASON_LABELS[r.category]}: ${r.text}`).join(" ") } : {}) }));
}
export function csvText(list: Intelligence[], ref?: RfqReference, weights?: Weights) {
  const rows = exportRows(list, ref, weights);
  const first = rows[0];
  if (!first) return "";
  const keys = Object.keys(first) as (keyof typeof first)[];
  const safe = (x: unknown) => { const s = value(x); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`; };
  return [keys.map(safe).join(","), ...rows.map((r) => keys.map((k) => safe(r[k])).join(","))].join("\r\n");
}
export async function exportAnalysis(format: "csv" | "xlsx" | "pdf", list: Intelligence[], ref: RfqReference, weights: Weights) {
  const filename = (ref.rfqNumber || "RFQ").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (format === "csv") {
    const url = URL.createObjectURL(new Blob(["\uFEFF", csvText(list, ref, weights)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${filename}-analysis.csv`; link.click(); URL.revokeObjectURL(url); return;
  }
  const insights = decisionInsights(list, ref);
  const explanation = explainRecommendation(list, ref, weights);
  const explanationRows = [
    ["Robustness", explanation.robustness],
    ["Savings vs next eligible alternative USD", usd(explanation.nextSavings)],
    ["Next eligible alternative", explanation.next?.name ?? "No eligible alternative"],
    ...explanation.winFactors.map((text) => ["Why this supplier won", text]),
    ...explanation.risks.map((text) => ["Risks and points of attention", text]),
    ...explanation.perSupplier.flatMap((p) => p.reasons.map((r) => [`${p.supplier.name} | ${REASON_LABELS[r.category]}`, r.text])),
  ];
  const breakdowns = list.map((a) => ({ a, b: buildLandedCostBreakdown(a, { reference: ref }) }));
  if (format === "xlsx") {
    const X = await import("xlsx"); const wb = X.utils.book_new();
    const add = (name: string, rows: object[]) => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), name);
    add("RFQ Data", Object.entries(ref).map(([Field, v]) => ({ Field: REF_LABELS[Field] ?? "RFQ information", Value: refValue(Field, v) })));
    add("Supplier Data", list.flatMap((a) => REVIEW_FIELDS.map((f) => ({ Supplier: a.name, Field: f.label, "Original extraction": humanValue(a.document.original?.[f.key]), "Reviewed quotation": humanValue(a.document.reviewed?.[f.key]) }))));
    add("Normalized Cost Data", exportRows(list, ref, weights));
    add("Scoring", list.flatMap((a) => a.contributions.map((c) => ({ Supplier: a.name, Criterion: CRITERIA[c.key], Weight: weights[c.key], Score: round2(c.value), Contribution: round2(c.weighted), Formula: c.reason }))));
    add("Risk Assessment", list.flatMap((a) => [{ Supplier: a.name, Risk: a.risk, Observation: "Overall risk", Critical: !a.eligible }, ...a.anomalies.map((x) => ({ Supplier: a.name, Risk: a.risk, Observation: x.message, Critical: x.critical }))]));
    add("Recommendation", [{ Supplier: insights.recommended?.name ?? "No eligible supplier", "Savings USD": round2(insights.savings), "Baseline": insights.baselineLabel, "Annual landed USD": round2(insights.recommended?.annualLanded ?? null), Why: insights.why ?? "Not provided" }]);
    add("Decision Explanation", explanationRows.map(([Metric, Value]) => ({ Metric, Value })));
    add("Landed Cost Breakdown", breakdowns.flatMap<object>(({ a, b }) => b.validationErrors.length ? b.validationErrors.map((Error) => ({ Supplier: a.name, Error })) : b.components.map((c) => ({ Supplier: a.name, Component: c.label, "Original amount": c.amountOriginal, Currency: c.currencyOriginal, "FX to USD": c.fxRate, "Amount USD": round2(c.amountUsd), Source: SOURCE_LABELS[c.source], Treatment: c.note, Formula: c.formula }))));
    X.writeFile(wb, `${filename}-analysis.xlsx`); return;
  }
  const { jsPDF } = await import("jspdf"); const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape" });
  // SIGNAL & STRUCTURE print palette: deep forest band, sunken table headers, ink body, default borders.
  const forest: [number, number, number] = [11, 48, 43];
  const ivory: [number, number, number] = [245, 244, 236];
  const ink: [number, number, number] = [16, 23, 20];
  const sunken: [number, number, number] = [232, 233, 229];
  const line: [number, number, number] = [214, 216, 210];
  const signal: [number, number, number] = [53, 213, 138];
  const series: [number, number, number] = [30, 82, 70];
  const totalPages = () => pdf.getNumberOfPages();
  const finish = () => { for (let p = 1; p <= totalPages(); p++) { pdf.setPage(p); pdf.setFontSize(7); pdf.setTextColor(...ink); pdf.text("Stephany Alves · SIGNAL & STRUCTURE · Synthetic data", 14, 205); } };
  const band = (title: string) => { pdf.setFillColor(...forest); pdf.rect(0, 0, 297, 16, "F"); pdf.setTextColor(...ivory); pdf.setFontSize(10); pdf.text("AeroQuote Compass", 14, 10.5); pdf.setTextColor(...ink); pdf.setFontSize(16); pdf.text(ascii(title), 14, 28); };
  const table = (title: string, head: string[], rows: string[][]) => { band(title); autoTable(pdf, { startY: 35, head: [head.map(ascii)], body: rows.map((r) => r.map(ascii)), styles: { fontSize: 8, textColor: ink, lineColor: line, lineWidth: 0.1 }, headStyles: { fillColor: sunken, textColor: ink }, theme: "grid" }); };
  table("RFQ Information", ["Field", "Value"], Object.entries(ref).map(([k, v]) => [REF_LABELS[k] ?? "RFQ information", refValue(k, v)]));
  pdf.addPage(); table("Supplier Comparison | USD", ["Supplier", "Original price", "Annual material", "Annual landed", "Overall score", "Risk"], list.map((a) => [a.name, `${a.baseline.quote.currency} ${value(a.baseline.quote.unit_price)}`, usd(a.material), `${usd(a.annualLanded)}${a.estimated ? " (Estimated)" : ""}${a.incomplete ? " (Incomplete)" : ""}`, score1(a.score), a.risk]));
  pdf.addPage(); band("Annual Landed Cost by Supplier | USD");
  const max = Math.max(...list.map((a) => a.annualLanded ?? 0), 1);
  list.forEach((a, i) => { const y = 44 + i * 7; pdf.setFontSize(9); pdf.setTextColor(...ink); pdf.text(ascii(a.name.slice(0, 35)), 14, y); pdf.setFillColor(...(a.name === insights.recommended?.name ? signal : series)); pdf.rect(85, y - 4, Math.max(0.5, (a.annualLanded ?? 0) / max * 140), 4, "F"); pdf.text(usd(a.annualLanded), 230, y); });
  pdf.addPage(); table("Supplier Score | Transparent Contributions", ["Supplier", "Criterion", "Weight", "Score", "Contribution", "Formula"], list.flatMap((a) => a.contributions.map((c) => [a.name, CRITERIA[c.key], `${weights[c.key]}%`, score1(c.value), score1(c.weighted), c.reason])));
  pdf.addPage(); table("Risk Assessment & Quote Anomalies", ["Supplier", "Risk", "Severity", "Observation"], list.flatMap((a) => a.anomalies.map((x) => [a.name, a.risk, x.critical ? "Critical" : "Warning", x.message])));
  pdf.addPage(); table("Procurement Recommendation & Decision Impact", ["Metric", "Value"], [
    ["Recommended supplier", insights.recommended?.name ?? "No eligible supplier"], ["Overall score", score1(insights.recommended?.score)], ["Annual landed cost USD", usd(insights.recommended?.annualLanded)],
    ["Potential savings USD", usd(insights.savings)], ["Savings baseline", insights.baselineLabel], ["Cost difference vs lowest quote USD", usd(insights.difference)],
    ["Why this supplier?", insights.why ?? "Resolve critical / incomplete data before an award recommendation."],
    ["Key trade-offs", insights.recommended ? `Cost premium vs lowest quote: USD ${usd(insights.difference)}; lead time: ${days(insights.recommended.baseline.quote.lead_time_days)}; payment terms: ${days(insights.recommended.baseline.quote.payment_terms_days)}; risk: ${insights.recommended.risk}; estimated logistics: ${insights.recommended.estimated}.` : "Not provided"],
  ]);
  pdf.addPage(); table("Recommendation Explanation", ["Metric / supplier", "Explanation"], explanationRows);
  for (const { a, b } of breakdowns) { pdf.addPage(); table(`${a.name} | Landed Cost Breakdown`, ["Component", "Original value", "FX to USD", "USD", "Source", "Treatment / note", "Formula"], b.validationErrors.length ? b.validationErrors.map((e) => ["Calculation blocked", e, "", "", "", "", ""]) : b.components.map((c) => [c.label, `${c.currencyOriginal} ${usd(c.amountOriginal)}`, c.fxRate.toFixed(6), usd(c.amountUsd), SOURCE_LABELS[c.source], c.note, c.formula])); }
  finish();
  pdf.save(`${filename}-analysis.pdf`);
}

/** Auditable decision summary: CSV (stacked sections), Excel (one sheet per section) or PDF (one table per section). */
export async function exportDecisionSummary(format: "csv" | "xlsx" | "pdf", sections: import("./decision-summary").SummarySection[], ref: RfqReference) {
  const filename = `${(ref.rfqNumber || "RFQ").replace(/[^a-zA-Z0-9_-]/g, "_")}-decision-summary`;
  if (format === "csv") {
    const { summaryCsv } = await import("./decision-summary");
    const url = URL.createObjectURL(new Blob(["\uFEFF", summaryCsv(sections)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${filename}.csv`; link.click(); URL.revokeObjectURL(url); return;
  }
  if (format === "xlsx") {
    const X = await import("xlsx"); const wb = X.utils.book_new();
    for (const s of sections) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([s.columns, ...s.rows]), s.sheet.slice(0, 31));
    X.writeFile(wb, `${filename}.xlsx`); return;
  }
  const { jsPDF } = await import("jspdf"); const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape" });
  const ascii2 = (s: string) => ascii(s).replaceAll("→", "->").replaceAll("·", "|").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
  sections.forEach((s, i) => {
    if (i) pdf.addPage();
    pdf.setFillColor(11, 48, 43); pdf.rect(0, 0, 297, 16, "F"); pdf.setTextColor(245, 244, 236); pdf.setFontSize(10); pdf.text("AeroQuote Compass | Auditable decision summary", 14, 10.5);
    pdf.setTextColor(16, 23, 20); pdf.setFontSize(13); pdf.text(ascii2(s.title), 14, 27);
    autoTable(pdf, { startY: 32, head: [s.columns.map(ascii2)], body: s.rows.map((r) => r.map(ascii2)), styles: { fontSize: 7, textColor: [16, 23, 20], lineColor: [214, 216, 210], lineWidth: 0.1 }, headStyles: { fillColor: [232, 233, 229], textColor: [16, 23, 20] }, margin: { bottom: 14 } });
  });
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) { pdf.setPage(p); pdf.setFontSize(7); pdf.text("Stephany Alves | SIGNAL & STRUCTURE | Synthetic data", 14, 205); }
  pdf.save(`${filename}.pdf`);
}
