import type { Alert, Currency, ExtractedQuote, QuoteAnalysis, RfqReference, RiskLevel } from "./types";

export const DEFAULT_INCOTERM_ADDERS: Record<string, number> = {
  EXW: 6,
  FCA: 4,
  FOB: 3,
  "CPT/CIP": 1.5,
  "DAP/DDP": 0,
};

export function toUsd(amount: number, currency: Currency | null, ref: Pick<RfqReference, "usdBrl" | "eurBrl">): number | null {
  if (currency === "USD") return amount;
  if (currency === "BRL") return amount / ref.usdBrl;
  if (currency === "EUR") return (amount * ref.eurBrl) / ref.usdBrl;
  return null;
}

export function incotermAdderPct(incoterm: string | null, adders: Record<string, number>): number | null {
  if (!incoterm) return null;
  const code = incoterm.trim().toUpperCase();
  for (const [key, pct] of Object.entries(adders)) {
    if (key.split("/").map((k) => k.trim()).includes(code)) return pct;
  }
  return null;
}

/** Unit price that applies at the given annual volume, using price breaks. */
export function applicableUnitPrice(q: ExtractedQuote, volume: number): number | null {
  const breaks = [...(q.price_breaks ?? [])]
    .filter((b) => b && typeof b.min_qty === "number" && typeof b.unit_price === "number")
    .sort((a, b) => a.min_qty - b.min_qty);
  let price = q.unit_price;
  for (const b of breaks) {
    if (volume >= b.min_qty) price = b.unit_price;
  }
  return price ?? null;
}

const norm = (s: string) => s.toUpperCase().replace(/^REV(ISION)?\.?\s*/, "").replace(/[\s-]/g, "");

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(toIso.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

const fmtUsd = (n: number) => "USD " + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function computeAlerts(q: ExtractedQuote, ref: RfqReference): Alert[] {
  const alerts: Alert[] = [];
  if (q.revision && ref.revision && norm(q.revision) !== norm(ref.revision)) {
    alerts.push({ code: "REVISION", severity: "HIGH", message: `Quoted Rev ${q.revision}, requested Rev ${ref.revision}.` });
  }
  const req = norm(ref.requiredCertification || "");
  if (req && !(q.certifications ?? []).some((c) => norm(c).includes(req))) {
    alerts.push({ code: "CERTIFICATION", severity: "HIGH", message: `Required certification ${ref.requiredCertification} not stated.` });
  }
  if (!q.eccn || /confirm|tbc|tbd/i.test(q.eccn)) {
    alerts.push({ code: "ECCN", severity: "MEDIUM", message: "ECCN missing or to be confirmed." });
  }
  if (q.new_supplier_requires_qualification) {
    alerts.push({ code: "QUALIFICATION", severity: "MEDIUM", message: "New supplier; qualification required before first lot." });
  }
  if (q.validity_end_date && ref.today) {
    const d = daysBetween(ref.today, q.validity_end_date);
    if (d < 0) alerts.push({ code: "EXPIRED", severity: "HIGH", message: `Quote expired on ${q.validity_end_date} (${-d} days ago).` });
    else if (d < 30) alerts.push({ code: "EXPIRING", severity: "MEDIUM", message: `Quote expires on ${q.validity_end_date} (in ${d} days).` });
  }
  const otc = q.one_time_costs ?? [];
  for (const c of otc) {
    const usd = toUsd(c.amount, c.currency ?? q.currency, ref);
    alerts.push({
      code: "ONE_TIME_COST",
      severity: "INFO",
      message: `${c.type} charged separately: ${c.currency ?? q.currency ?? ""} ${c.amount.toLocaleString("en-US")}${usd !== null && (c.currency ?? q.currency) !== "USD" ? ` (${fmtUsd(usd)})` : ""}.`,
    });
  }
  if (q.fai_included === false && !otc.some((c) => /fai|first article/i.test(c.type))) {
    alerts.push({ code: "FAI", severity: "INFO", message: "FAI not included; cost not stated." });
  }
  if (q.surcharge_clause) {
    alerts.push({ code: "SURCHARGE", severity: "MEDIUM", message: `Price-adjustment clause: ${q.surcharge_clause}` });
  }
  if (q.lead_time_days !== null && q.lead_time_days > 120) {
    alerts.push({ code: "LEAD_TIME", severity: "MEDIUM", message: `Lead time ${q.lead_time_days} days exceeds 120 days.` });
  }
  return alerts;
}

export function riskLevel(alerts: Alert[]): RiskLevel {
  if (alerts.some((a) => a.severity === "HIGH")) return "High";
  if (alerts.some((a) => a.severity === "MEDIUM")) return "Medium";
  return "Low";
}

export function analyzeQuote(q: ExtractedQuote, ref: RfqReference, index = 0): QuoteAnalysis {
  const unit = applicableUnitPrice(q, ref.annualVolume);
  const unitUsd = unit !== null ? toUsd(unit, q.currency, ref) : null;
  const goods = unitUsd !== null ? unitUsd * ref.annualVolume : null;
  const oneTime = (q.one_time_costs ?? []).reduce((s, c) => s + (toUsd(c.amount, c.currency ?? q.currency, ref) ?? 0), 0);
  const pct = incotermAdderPct(q.incoterm, ref.incotermAdders);
  const freight = goods !== null && pct !== null ? (goods * pct) / 100 : null;
  const total = goods !== null ? goods + (freight ?? 0) + oneTime : null;
  const alerts = computeAlerts(q, ref);
  const risk = riskLevel(alerts);
  return {
    index,
    quote: q,
    applicableUnitPrice: unit,
    unitPriceUsd: unitUsd,
    annualGoodsUsd: goods,
    oneTimeUsd: oneTime,
    freightPct: pct,
    freightUsd: freight,
    annualTotalUsd: total,
    alerts,
    risk,
    awardable: risk !== "High",
    rank: 0,
  };
}

export function rankQuotes(analyses: QuoteAnalysis[]): QuoteAnalysis[] {
  return [...analyses]
    .sort((a, b) => (a.annualTotalUsd ?? Infinity) - (b.annualTotalUsd ?? Infinity))
    .map((a, i) => ({ ...a, rank: i + 1 }));
}
