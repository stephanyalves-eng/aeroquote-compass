import type { RfqReference } from "./types";
import { CRITERIA, decisionInsights, type Intelligence, type Weights } from "./intelligence";

const value = (x: unknown): string => x == null ? "Not provided" : typeof x === "object" ? JSON.stringify(x) : String(x);
const round2 = (n: number | null): number | null => n == null ? null : Math.round(n * 100) / 100;
const usd = (n: number | null | undefined): string => n == null ? "Not provided" : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const score1 = (n: number | null | undefined): string => n == null ? "Not provided" : n.toFixed(1);
const days = (n: number | null | undefined): string => n == null ? "Not provided" : `${n} days`;
// jsPDF standard fonts cannot render ÷ × − ≥; the PDF uses ASCII only.
const ascii = (s: string): string => s.replaceAll("÷", "/").replaceAll("×", "x").replaceAll("−", "-").replaceAll("≥", ">=");

const REF_LABELS: Record<string, string> = {
  rfqNumber: "RFQ number", partNumber: "Part number", revision: "Requested revision", annualVolume: "Annual volume (units)",
  requiredCertification: "Required certification", usdBrl: "USD/BRL exchange rate", eurBrl: "EUR/BRL exchange rate",
  incotermAdders: "Freight / insurance adders", today: "Analysis date", description: "Description", category: "Category",
  requiredDeliveryDate: "Required delivery date", deliveryLocation: "Delivery location", currency: "RFQ currency",
  incumbentSupplier: "Incumbent supplier", targetCost: "Annual target cost",
};
const refValue = (k: string, v: unknown): string =>
  k === "incotermAdders" && v != null && typeof v === "object"
    ? Object.entries(v as Record<string, number>).map(([key, pct]) => `${key} ${pct}%`).join(" | ")
    : value(v);

export function exportRows(list: Intelligence[]) {
  return list.map((a) => ({ Supplier: a.name, Fictitious: a.fictitious, Currency: a.baseline.quote.currency, "Original unit price": a.baseline.quote.unit_price,
    "Normalized unit price USD": round2(a.baseline.unitPriceUsd), "Annual material USD": round2(a.material), "Quoted annual freight USD": round2(a.freight), "Quoted annual insurance USD": round2(a.insurance),
    "Combined freight / insurance adder USD": round2(a.combinedEstimate), Estimated: a.estimated, Incomplete: a.incomplete, "Duties USD": round2(a.duties), "Other adders USD": round2(a.other), "One-time USD": round2(a.oneTime),
    "Annual landed cost USD": round2(a.annualLanded), "Unit landed cost USD": round2(a.unitLanded), MOQ: a.baseline.quote.moq, "Lead time days": a.baseline.quote.lead_time_days, "Payment days": a.baseline.quote.payment_terms_days,
    Risk: a.risk, "Risk score": a.riskScore, "Overall score": a.score == null ? null : round2(a.score), Awardable: a.eligible }));
}
export function csvText(list: Intelligence[]) {
  const rows = exportRows(list);
  const first = rows[0];
  if (!first) return "";
  const keys = Object.keys(first) as (keyof typeof first)[];
  const safe = (x: unknown) => { const s = value(x); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`; };
  return [keys.map(safe).join(","), ...rows.map((r) => keys.map((k) => safe(r[k])).join(","))].join("\r\n");
}
export async function exportAnalysis(format: "csv" | "xlsx" | "pdf", list: Intelligence[], ref: RfqReference, weights: Weights) {
  const filename = (ref.rfqNumber || "RFQ").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (format === "csv") {
    const url = URL.createObjectURL(new Blob(["\uFEFF", csvText(list)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${filename}-analysis.csv`; link.click(); URL.revokeObjectURL(url); return;
  }
  const insights = decisionInsights(list, ref);
  if (format === "xlsx") {
    const X = await import("xlsx"); const wb = X.utils.book_new();
    const add = (name: string, rows: object[]) => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), name);
    add("RFQ Data", Object.entries(ref).map(([Field, v]) => ({ Field, Value: value(v) })));
    add("Supplier Data", list.map((a) => ({ Supplier: a.name, "Original extraction": value(a.document.original), "Reviewed quotation": value(a.document.reviewed) })));
    add("Normalized Cost Data", exportRows(list));
    add("Scoring", list.flatMap((a) => a.contributions.map((c) => ({ Supplier: a.name, Criterion: CRITERIA[c.key], Weight: weights[c.key], Score: round2(c.value), Contribution: round2(c.weighted), Formula: c.reason }))));
    add("Risk Assessment", list.flatMap((a) => [{ Supplier: a.name, Risk: a.risk, Observation: "Overall risk", Critical: !a.eligible }, ...a.anomalies.map((x) => ({ Supplier: a.name, Risk: a.risk, Observation: x.message, Critical: x.critical }))]));
    add("Recommendation", [{ Supplier: insights.recommended?.name ?? "No eligible supplier", "Savings USD": round2(insights.savings), "Baseline": insights.baselineLabel, "Annual landed USD": round2(insights.recommended?.annualLanded ?? null), Why: insights.why ?? "Not provided" }]);
    X.writeFile(wb, `${filename}-analysis.xlsx`); return;
  }
  const { jsPDF } = await import("jspdf"); const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape" });
  const table = (title: string, head: string[], rows: string[][]) => { pdf.setFontSize(16); pdf.text(ascii(title), 14, 18); autoTable(pdf, { startY: 25, head: [head.map(ascii)], body: rows.map((r) => r.map(ascii)), styles: { fontSize: 8 }, theme: "grid" }); };
  table("AeroQuote Compass | RFQ Information", ["Field", "Value"], Object.entries(ref).map(([k, v]) => [REF_LABELS[k] ?? k, refValue(k, v)]));
  pdf.addPage(); table("Supplier Comparison | USD", ["Supplier", "Original price", "Annual material", "Annual landed", "Overall score", "Risk"], list.map((a) => [a.name, `${a.baseline.quote.currency} ${value(a.baseline.quote.unit_price)}`, usd(a.material), `${usd(a.annualLanded)}${a.estimated ? " (Estimated)" : ""}${a.incomplete ? " (Incomplete)" : ""}`, score1(a.score), a.risk]));
  pdf.addPage(); pdf.text("Annual Landed Cost by Supplier | USD", 14, 18);
  const max = Math.max(...list.map((a) => a.annualLanded ?? 0), 1);
  list.forEach((a, i) => { const y = 34 + i * 7; pdf.setFontSize(9); pdf.text(ascii(a.name.slice(0, 35)), 14, y); pdf.rect(85, y - 4, Math.max(0.5, (a.annualLanded ?? 0) / max * 140), 4); pdf.text(usd(a.annualLanded), 230, y); });
  pdf.addPage(); table("Supplier Score | Transparent Contributions", ["Supplier", "Criterion", "Weight", "Score", "Contribution", "Formula"], list.flatMap((a) => a.contributions.map((c) => [a.name, CRITERIA[c.key], `${weights[c.key]}%`, score1(c.value), score1(c.weighted), c.reason])));
  pdf.addPage(); table("Risk Assessment & Quote Anomalies", ["Supplier", "Risk", "Severity", "Observation"], list.flatMap((a) => a.anomalies.map((x) => [a.name, a.risk, x.critical ? "Critical" : "Warning", x.message])));
  pdf.addPage(); table("Procurement Recommendation & Decision Impact", ["Metric", "Value"], [
    ["Recommended supplier", insights.recommended?.name ?? "No eligible supplier"], ["Overall score", score1(insights.recommended?.score)], ["Annual landed cost USD", usd(insights.recommended?.annualLanded)],
    ["Potential savings USD", usd(insights.savings)], ["Savings baseline", insights.baselineLabel], ["Cost difference vs lowest quote USD", usd(insights.difference)],
    ["Why this supplier?", insights.why ?? "Resolve critical / incomplete data before an award recommendation."],
    ["Key trade-offs", insights.recommended ? `Cost premium vs lowest quote: USD ${usd(insights.difference)}; lead time: ${days(insights.recommended.baseline.quote.lead_time_days)}; payment terms: ${days(insights.recommended.baseline.quote.payment_terms_days)}; risk: ${insights.recommended.risk}; estimated logistics: ${insights.recommended.estimated}.` : "Not provided"],
  ]);
  pdf.save(`${filename}-analysis.pdf`);
}
