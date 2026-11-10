import { DASHBOARD_STEP } from "./erp-nav";

/** Addressable screens: each workflow view has a stable `?view=` slug. */
export const VIEW_SLUGS: { slug: string; step: number; label: string }[] = [
  { slug: "dashboard", step: DASHBOARD_STEP, label: "Dashboard" },
  { slug: "rfq-setup", step: 0, label: "RFQ Setup" },
  { slug: "quotations", step: 1, label: "Quotations" },
  { slug: "validation", step: 2, label: "Buyer Validation" },
  { slug: "comparison", step: 3, label: "Supplier Comparison" },
  { slug: "decisions", step: 4, label: "Decisions" },
  { slug: "purchase-orders", step: 5, label: "Purchase Orders" },
  { slug: "configuration", step: 6, label: "Configuration" },
  { slug: "audit-trail", step: 7, label: "Audit Trail" },
  { slug: "investigations", step: 8, label: "Investigations" },
  { slug: "release-control", step: 9, label: "Release Control" },
];
export const HISTORY_VIEW = "history";
export function viewSlug(step: number): string {
  return VIEW_SLUGS.find((v) => v.step === step)?.slug ?? "dashboard";
}
export interface ViewGates {
  /** Every included quotation is buyer-confirmed and RFQ inputs are valid. */
  ready: boolean;
  /** An approved decision exists for the current analysis. */
  decision: boolean;
  hasDocuments: boolean;
}
export interface ResolvedView {
  step: number;
  history: boolean;
  slug: string;
  /** Explanation when the requested screen was not available and a fallback is shown. */
  reason: string | null;
}
/** Gate reason for a screen, or null when it can be opened. */
export function viewGate(step: number, gates: ViewGates): string | null {
  if ((step === 3 || step === 4) && !gates.ready) return "Confirm every quotation in Buyer Validation first.";
  if (step === 5 && !gates.decision) return "Record a decision first.";
  return null;
}
/** Maps a URL view to a screen, falling back to the nearest earlier allowed screen with a short explanation. */
export function resolveView(requested: string | undefined, gates: ViewGates): ResolvedView {
  if (requested === HISTORY_VIEW) return { step: DASHBOARD_STEP, history: true, slug: HISTORY_VIEW, reason: null };
  const match = VIEW_SLUGS.find((v) => v.slug === requested);
  if (!match) {
    const reason = requested ? `The screen "${requested}" does not exist. Showing the Dashboard.` : null;
    return { step: DASHBOARD_STEP, history: false, slug: "dashboard", reason };
  }
  const blocked = viewGate(match.step, gates);
  if (!blocked) return { step: match.step, history: false, slug: match.slug, reason: null };
  const fallback = match.step === 5 && gates.ready ? 4 : gates.hasDocuments ? 2 : 1;
  const target = VIEW_SLUGS.find((v) => v.step === fallback)!;
  return { step: fallback, history: false, slug: target.slug, reason: `${match.label} is not available yet: ${blocked} Showing ${target.label} instead.` };
}
