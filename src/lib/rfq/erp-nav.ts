import type { QuoteDocument } from "./workflow";
import { quotationConfirmationErrors } from "./review-issues";

/** Sidebar navigation model for the ERP shell. Steps map onto the existing workflow views. */
export interface ErpNavItem {
  id: string;
  label: string;
  group: "Operate" | "Decide" | "Trace";
  step: number;
}
export const DASHBOARD_STEP = -1;
export const ERP_NAV: ErpNavItem[] = [
  { id: "dashboard", label: "Dashboard", group: "Operate", step: DASHBOARD_STEP },
  { id: "rfq", label: "RFQ Setup", group: "Operate", step: 0 },
  { id: "quotes", label: "Quotations", group: "Operate", step: 1 },
  { id: "validation", label: "Buyer Validation", group: "Operate", step: 2 },
  { id: "comparison", label: "Supplier Comparison", group: "Decide", step: 3 },
  { id: "decisions", label: "Decisions", group: "Decide", step: 4 },
  { id: "po", label: "Purchase Orders", group: "Decide", step: 5 },
  { id: "release", label: "Release Control", group: "Decide", step: 5 },
  { id: "configuration", label: "Configuration", group: "Trace", step: 6 },
  { id: "audit", label: "Audit Trail", group: "Trace", step: 7 },
  { id: "investigations", label: "Investigations", group: "Trace", step: 8 },
];
export const ERP_NAV_GROUPS = ["Operate", "Decide", "Trace"] as const;

export type ErpStepStatus = "Not started" | "In progress" | "Requires attention" | "Blocked" | "Completed";
export interface ErpProcessStep {
  label: string;
  status: ErpStepStatus;
  detail: string;
}
export interface ErpProcessInput {
  setupValid: boolean;
  documents: QuoteDocument[];
  extracting: boolean;
  comparisonComputed: boolean;
  decisionApproved: boolean;
  hasPo: boolean;
  poChecked: boolean;
  poStatus: string;
  configurationBlocked: boolean;
}

/**
 * Compact eight-step process flow derived from real workflow evidence.
 * A later step is never Completed while an earlier prerequisite is not.
 */
export function erpProcessSteps(state: ErpProcessInput): ErpProcessStep[] {
  const included = state.documents.filter((d) => !d.excluded);
  const extracted = state.documents.length > 0 && state.documents.every((d) => d.original && d.reviewed);
  const reviewed =
    extracted &&
    included.length > 0 &&
    included.every((d) => d.confirmed && d.status === "Extracted" && quotationConfirmationErrors(d).length === 0);
  const compared = reviewed && state.comparisonComputed;
  const approved = compared && state.decisionApproved;
  const hasPo = approved && state.hasPo;
  const checked = hasPo && state.poChecked;
  const poBlocked = checked && state.poStatus === "PO blocked";
  const poVerified = checked && (state.poStatus === "PO checked, awaiting release" || state.poStatus === "PO checked and released");
  const released = poVerified && !state.configurationBlocked && state.poStatus === "PO checked and released";

  const evidence = [
    { label: "RFQ created", done: state.setupValid, active: true, blocked: false, attention: false, detail: "RFQ details recorded" },
    { label: "Quotes received", done: state.documents.length > 0, active: state.setupValid, blocked: false, attention: false, detail: `${state.documents.length} quotation${state.documents.length === 1 ? "" : "s"} on file` },
    { label: "Buyer validation", done: reviewed, active: extracted, blocked: false, attention: extracted && !reviewed, detail: reviewed ? "All quotations confirmed" : "Critical fields need confirmation" },
    { label: "Comparison complete", done: compared, active: reviewed, blocked: false, attention: false, detail: "Landed costs, scores and risks calculated" },
    { label: "Decision approved", done: approved, active: compared, blocked: false, attention: false, detail: "Sourcing decision recorded" },
    { label: "PO issued", done: hasPo, active: approved, blocked: false, attention: false, detail: "Purchase order created" },
    { label: "PO verified", done: poVerified, active: checked, blocked: poBlocked, attention: checked && !poVerified && !poBlocked, detail: poBlocked ? "Critical discrepancies block verification" : "PO Check against the approved decision" },
    { label: "Released", done: released, active: poVerified, blocked: poVerified && state.configurationBlocked, attention: false, detail: "Release before manufacturing" },
  ];

  let previousDone = true;
  return evidence.map((e) => {
    let status: ErpStepStatus;
    if (e.done && previousDone) status = "Completed";
    else if (e.blocked && previousDone) status = "Blocked";
    else if (e.attention && previousDone) status = "Requires attention";
    else if (e.active && previousDone) status = "In progress";
    else status = "Not started";
    if (e.done && !previousDone) status = "In progress";
    previousDone = e.done && previousDone;
    return { label: e.label, status, detail: e.detail };
  });
}
