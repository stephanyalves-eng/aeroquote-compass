import { applicableUnitPrice, toUsd, incotermAdderPct } from "./rules";
import type { Intelligence, Weights } from "./intelligence";
import type { ExtractedQuote, RfqReference, Currency } from "./types";
import type { CostComponent, LandedCostBreakdown } from "./review-types";
import { sameReviewValue } from "./review-issues";

export interface ScenarioInput {
  reference: RfqReference; annualVolume?: number; usdBrl?: number; eurBrl?: number;
  /** Annual freight override in USD; replaces freight / combined estimate, never insurance. */
  freightOverride?: number; extraCosts?: { label: string; amount: number; currency: Currency }[]; weights?: Weights;
}
export const LANDED_FORMULA = "Annual landed cost = unit price × annual quantity (converted to USD) + freight + insurance (or Incoterm estimate) + duties + other adders + one-time costs (year 1)";
export function buildLandedCostBreakdown(input: Intelligence | ExtractedQuote, scenario: ScenarioInput): LandedCostBreakdown {
  const intelligence = "baseline" in input ? input : null;
  const q = intelligence ? intelligence.baseline.quote : input as ExtractedQuote;
  const ref = { ...scenario.reference, annualVolume: scenario.annualVolume ?? scenario.reference.annualVolume, usdBrl: scenario.usdBrl ?? scenario.reference.usdBrl, eurBrl: scenario.eurBrl ?? scenario.reference.eurBrl };
  const errors: string[] = [];
  const validCurrency = (c: unknown): c is Currency => c === "USD" || c === "EUR" || c === "BRL";
  const fx = (c: Currency) => toUsd(1, c, ref);
  if (!validCurrency(q.currency)) errors.push("A valid quotation currency is required.");
  if (!Number.isFinite(ref.annualVolume) || ref.annualVolume <= 0 || !Number.isInteger(ref.annualVolume)) errors.push("Annual quantity must be a positive whole number.");
  if (q.unit_price == null || !Number.isFinite(q.unit_price) || q.unit_price < 0) errors.push("A valid unit price is required.");
  if (q.price_breaks.some((b) => !Number.isFinite(b.min_qty) || b.min_qty < 0 || !Number.isFinite(b.unit_price) || b.unit_price < 0)) errors.push("A price break contains an invalid quantity or price.");
  const currencies = [q.currency, ...q.one_time_costs.map((c) => c.currency ?? q.currency), ...(scenario.extraCosts ?? []).map((c) => c.currency)];
  for (const c of currencies) if (!validCurrency(c) || (c !== "USD" && (!Number.isFinite(ref.usdBrl) || ref.usdBrl <= 0)) || (c === "EUR" && (!Number.isFinite(ref.eurBrl) || ref.eurBrl <= 0))) errors.push(`A valid currency and exchange rate are required for ${c ?? "the charge"}.`);
  const amounts = [q.freight, q.insurance, q.duties, q.other_adders, scenario.freightOverride, ...q.one_time_costs.map((c) => c.amount), ...(scenario.extraCosts ?? []).map((c) => c.amount)];
  if (amounts.some((n) => n != null && (!Number.isFinite(n) || n < 0))) errors.push("Cost amounts must be finite, non-negative numbers.");
  const pct = incotermAdderPct(q.incoterm, ref.incotermAdders);
  if (scenario.freightOverride == null && q.freight == null && q.insurance == null && (pct == null || !Number.isFinite(pct) || pct < 0)) errors.push("No quoted logistics or valid Incoterm estimate is available.");
  const price = applicableUnitPrice(q, ref.annualVolume);
  const inputs: LandedCostBreakdown["inputs"] = { unitPrice: price, annualQuantity: ref.annualVolume, currency: q.currency, fxRate: validCurrency(q.currency) ? fx(q.currency) : null, unitPriceUsd: null, source: "extracted" };
  const source = (field: keyof ExtractedQuote): CostComponent["source"] => intelligence?.document.original && !sameReviewValue(q[field], intelligence.document.original[field]) ? "buyer" : "extracted";
  inputs.source = source(price === q.unit_price ? "unit_price" : "price_breaks");
  if (errors.length || price == null || !validCurrency(q.currency)) return { components: [], annualTotal: null, unitTotal: null, validationErrors: [...new Set(errors)], inputs, formula: LANDED_FORMULA };
  const currency = q.currency;
  const unitUsd = toUsd(price, currency, ref);
  if (unitUsd == null) return { components: [], annualTotal: null, unitTotal: null, validationErrors: ["Unit price cannot be converted to USD."], inputs, formula: LANDED_FORMULA };
  inputs.unitPriceUsd = unitUsd;
  const components: CostComponent[] = [];
  const add = (key: string, label: string, original: number, c: Currency, amountUsd: number, provenance: CostComponent["source"], formula: string, note = "", treatment?: CostComponent["treatment"]) => components.push({ key, label, amountOriginal: original, currencyOriginal: c, fxRate: fx(c) ?? 1, amountUsd, source: provenance, formula, note, ...(treatment ? { treatment } : {}) });
  add("material", "Annual goods cost", price * ref.annualVolume, currency, unitUsd * ref.annualVolume, inputs.source === "buyer" ? "buyer" : "calculated", `${price} ${currency} × FX × ${ref.annualVolume} units`, "Applicable price break at the annual quantity; unit price source: " + (inputs.source === "buyer" ? "Buyer-entered" : "Extracted"));
  if (scenario.freightOverride != null) add("freight", "Freight", scenario.freightOverride, "USD", scenario.freightOverride, "buyer", "Annual freight override in USD");
  else if (q.freight != null) add("freight", "Freight", q.freight, currency, toUsd(q.freight, currency, ref) ?? 0, source("freight"), `${q.freight} ${currency} × FX`);
  if (q.insurance != null) add("insurance", "Insurance", q.insurance, currency, toUsd(q.insurance, currency, ref) ?? 0, source("insurance"), `${q.insurance} ${currency} × FX`);
  if (scenario.freightOverride == null && q.freight == null && q.insurance == null && pct != null) add("estimate", "Combined Incoterm estimate", price * ref.annualVolume * pct / 100, currency, unitUsd * ref.annualVolume * pct / 100, "assumption", `Annual goods USD × ${pct}%`, `System assumption: ${q.incoterm} logistics adder ${pct}%; no freight / insurance split invented.`);
  for (const [field, label] of [["duties", "Duties / taxes / tariffs"], ["other_adders", "Other annual adders"]] as const) { const n = q[field]; if (n != null) add(field, label, n, currency, toUsd(n, currency, ref) ?? 0, source(field), `${n} ${currency} × FX`, "Annual quoted amount", "recurring"); }
  q.one_time_costs.forEach((c, i) => { const cc = c.currency ?? currency; add(`one-time-${i}`, c.type, c.amount, cc, toUsd(c.amount, cc, ref) ?? 0, source("one_time_costs"), `${c.amount} ${cc} × FX`, "Charged in full in year 1; excluded from later years", "first_year_full"); });
  (scenario.extraCosts ?? []).forEach((c, i) => add(`extra-${i}`, c.label, c.amount, c.currency, toUsd(c.amount, c.currency, ref) ?? 0, "buyer", `${c.amount} ${c.currency} × FX`, "Scenario annual extra cost", "recurring"));
  // Preserve the established arithmetic grouping (including multiple one-time conversions).
  const oneTime = components.filter((c) => c.key.startsWith("one-time-")).reduce((s, c) => s + c.amountUsd, 0);
  const annualTotal = components.filter((c) => !c.key.startsWith("one-time-") && !c.key.startsWith("extra-")).reduce((s, c) => s + c.amountUsd, 0) + oneTime + components.filter((c) => c.key.startsWith("extra-")).reduce((s, c) => s + c.amountUsd, 0);
  return { components, annualTotal, unitTotal: annualTotal / ref.annualVolume, validationErrors: [], inputs, formula: LANDED_FORMULA };
}
export const SOURCE_LABELS = { extracted: "Extracted", buyer: "Buyer-entered", calculated: "Calculated", assumption: "System assumption" };
export function componentDiff(a: LandedCostBreakdown, b: LandedCostBreakdown) {
  return [...new Set([...a.components, ...b.components].map((c) => c.key))].map((key) => { const left = a.components.find((c) => c.key === key), right = b.components.find((c) => c.key === key); return { key, label: left?.label ?? right?.label ?? "Cost component", left: left?.amountUsd ?? null, right: right?.amountUsd ?? null, difference: left && right ? right.amountUsd - left.amountUsd : null }; });
}