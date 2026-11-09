import { quotationConfirmationErrors } from "./review-issues";
import type { QuoteDocument } from "./workflow";

export type StageStatus = "Pending" | "Received" | "Extracted" | "In progress" | "In review" | "Confirmed" | "Available" | "Blocked";
export interface WorkflowStageState {
  documents: QuoteDocument[];
  extracting: boolean;
  comparisonComputed: boolean;
  recommendationExists: boolean;
  decisionApproved: boolean;
  hasPo: boolean;
  poChecked: boolean;
  poStatus: string;
  configurationBlocked: boolean;
  revisionMonitoring: "Pending" | "In review" | "Confirmed";
  investigationConfirmed: boolean;
}

/** Display progress derives from current evidence, never the selected navigation tab. */
export function workflowStages(state: WorkflowStageState): { label: string; status: StageStatus }[] {
  const { documents } = state;
  const included = documents.filter((d) => !d.excluded);
  const extracted = documents.length > 0 && documents.every((d) => d.original && d.reviewed);
  const reviewed = extracted && included.length > 0 && included.every((d) => d.confirmed && d.status === "Extracted" && quotationConfirmationErrors(d).length === 0);
  const compared = reviewed && state.comparisonComputed;
  const recommended = compared && (state.recommendationExists || state.decisionApproved);
  const approved = recommended && state.decisionApproved;
  const hasPo = approved && state.hasPo;
  const checked = hasPo && state.poChecked;
  const checkConfirmed = checked && (state.poStatus === "PO checked, awaiting release" || state.poStatus === "PO checked and released");
  const released = checkConfirmed && !state.configurationBlocked && state.poStatus === "PO checked and released";
  const monitored = released && state.revisionMonitoring === "Confirmed";
  return [
    { label: "Quotes received", status: documents.length ? "Received" : "Pending" },
    { label: "AI extraction", status: state.extracting && documents.length ? "In progress" : extracted ? "Extracted" : "Pending" },
    { label: "Buyer review", status: reviewed ? "Confirmed" : extracted ? "In review" : "Pending" },
    { label: "Comparison & calculation", status: compared ? "Confirmed" : "Pending" },
    { label: "Recommendation", status: recommended ? "Confirmed" : "Pending" },
    { label: "Decision approved", status: approved ? "Confirmed" : "Pending" },
    { label: "PO creation/upload", status: hasPo ? "Received" : approved ? "Available" : "Pending" },
    { label: "PO Check", status: checked ? state.poStatus === "PO blocked" ? "Blocked" : checkConfirmed ? "Confirmed" : "In review" : "Pending" },
    { label: "Release before manufacturing", status: hasPo && state.configurationBlocked ? "Blocked" : released ? "Confirmed" : "Pending" },
    { label: "Revision monitoring", status: released ? state.revisionMonitoring : "Pending" },
    { label: "Failure investigation", status: monitored ? state.investigationConfirmed ? "Confirmed" : "In review" : "Pending" },
  ];
}