import { compareDocuments, decisionInsights, validWeights, CRITERIA, type Weights } from "./intelligence";
import { buildLandedCostBreakdown } from "./landed-cost";
import type { RfqReference } from "./types";
import type { QuoteDocument } from "./workflow";
import { canCompare } from "./workflow";
import { toUsd } from "./rules";

export interface ScenarioSettings {
  annualVolume: number;
  usdBrl: number;
  eurBrl: number;
  freightUsd: number | null;
  nreYears: number;
  weights: Weights;
}
export function defaultScenario(reference: RfqReference, weights: Weights): ScenarioSettings {
  return { annualVolume: reference.annualVolume, usdBrl: reference.usdBrl, eurBrl: reference.eurBrl, freightUsd: null, nreYears: 1, weights: { ...weights } };
}
const isNre = (label: string) => /\bnre\b|non[ -]?recurring engineering/i.test(label);
/** What-if only: clones confirmed quotes; never promotes original award blockers or changes approvals. */
export function simulateScenario(documents: QuoteDocument[], reference: RfqReference, weights: Weights, settings: ScenarioSettings) {
  const errors: string[] = [];
  if (!canCompare(documents, reference)) errors.push("Buyer confirmation is required before scenario analysis.");
  if (!Number.isInteger(settings.annualVolume) || settings.annualVolume <= 0) errors.push("Annual quantity must be a positive whole number.");
  if (![settings.usdBrl, settings.eurBrl].every((v) => Number.isFinite(v) && v > 0)) errors.push("Exchange rates must be positive finite numbers.");
  if (settings.freightUsd != null && (!Number.isFinite(settings.freightUsd) || settings.freightUsd < 0)) errors.push("Annual freight must be a non-negative finite USD amount.");
  if (!Number.isInteger(settings.nreYears) || settings.nreYears < 1) errors.push("NRE amortization must be a positive whole number of years.");
  if (!validWeights(settings.weights)) errors.push("Scenario weights must total 100% within 0.01 percentage points.");
  const baseline = canCompare(documents, reference) ? compareDocuments(documents, reference, weights) : [];
  const original = decisionInsights(baseline, reference).recommended;
  const changes: string[] = [];
  if (settings.annualVolume !== reference.annualVolume) changes.push(`Annual quantity: ${reference.annualVolume} → ${settings.annualVolume} units (applicable price breaks recalculated).`);
  if (settings.usdBrl !== reference.usdBrl || settings.eurBrl !== reference.eurBrl) changes.push(`FX: USD/BRL ${settings.usdBrl}, EUR/BRL ${settings.eurBrl}.`);
  if (settings.freightUsd != null) changes.push(`Annual freight: USD ${settings.freightUsd} per supplier, replacing quoted freight or the combined Incoterm estimate; quoted insurance retained.`);
  if (settings.nreYears !== 1) changes.push(`NRE annual allocation: original NRE ÷ ${settings.nreYears} years; tooling and FAI still charged in full.`);
  if (Object.keys(weights).some((key) => weights[key as keyof Weights] !== settings.weights[key as keyof Weights])) changes.push("Scoring weights changed; all supplier scores recomputed with the same scoring rules.");
  const ref = { ...reference, annualVolume: settings.annualVolume, usdBrl: settings.usdBrl, eurBrl: settings.eurBrl };
  if (errors.length) return { errors, list: [], rows: [], original, recommended: null, changed: false, explanation: "Correct scenario inputs before comparing results.", changes, reference: ref };
  const clones = documents.filter((d) => d.confirmed && !d.excluded && d.reviewed).map((d) => {
    const copy = structuredClone(d);
    const q = copy.reviewed;
    if (!q) return copy;
    q.one_time_costs = q.one_time_costs.map((cost) => isNre(cost.type) ? { ...cost, amount: cost.amount / settings.nreYears } : cost);
    if (settings.freightUsd != null) {
      const rate = toUsd(1, q.currency, ref);
      if (rate == null || !Number.isFinite(rate) || rate <= 0) errors.push(`Cannot convert scenario freight for ${q.supplier_name ?? "supplier"}.`);
      else q.freight = settings.freightUsd / rate;
    }
    return copy;
  });
  const list = compareDocuments(clones, ref, settings.weights);
  for (const supplier of list) {
    const originalSupplier = baseline.find((a) => a.document.id === supplier.document.id);
    supplier.eligible = supplier.eligible && Boolean(originalSupplier?.eligible);
  }
  const rows = list.map((supplier) => {
    const breakdown = buildLandedCostBreakdown(supplier, { reference: ref });
    if (settings.nreYears > 1) for (const component of breakdown.components) {
      if (component.key.startsWith("one-time-") && isNre(component.label)) {
        component.treatment = "amortized";
        component.note = `Simulation annual allocation over ${settings.nreYears} years; not year-one cash cost.`;
        component.formula = `Original NRE × FX ÷ ${settings.nreYears} years`;
      }
    }
    errors.push(...breakdown.validationErrors.map((e) => `${supplier.name}: ${e}`));
    const before = baseline.find((a) => a.document.id === supplier.document.id);
    return { supplier, breakdown, originalCost: before?.annualLanded ?? null, difference: supplier.annualLanded == null || before?.annualLanded == null ? null : supplier.annualLanded - before.annualLanded, originalScore: before?.score ?? null };
  });
  const recommended = errors.length ? null : decisionInsights(list, ref).recommended;
  const changed = Boolean(original && recommended && original.document.id !== recommended.document.id);
  let explanation = recommended ? `${recommended.name} remains the highest-scoring eligible supplier.` : "No eligible scenario recommendation is available.";
  if (changed && original && recommended) {
    const previous = list.find((a) => a.document.id === original.document.id);
    const edges = recommended.contributions.map((c) => ({ label: CRITERIA[c.key], delta: (c.weighted ?? 0) - (previous?.contributions.find((p) => p.key === c.key)?.weighted ?? 0) })).filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta);
    explanation = `${recommended.name} replaces ${original.name} in this simulation: score ${recommended.score?.toFixed(1)} vs ${previous?.score?.toFixed(1) ?? "not available"}. ${edges.map((c) => `${c.label}: +${c.delta.toFixed(1)} weighted points`).join("; ")}. Original recommendation and recorded decision are unchanged.`;
  }
  return { errors: [...new Set(errors)], list: errors.length ? [] : list, rows: errors.length ? [] : rows, original, recommended, changed, explanation, changes, reference: ref };
}