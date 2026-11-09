import type { QuoteDocument } from "./workflow";
import { quotationConfirmationErrors } from "./review-issues";
import { daysBetween } from "./rules";
import { poSummary } from "./po-check";
import type { PoState } from "./po-types";
import type { RfqReference } from "./types";
import type { FailureInvestigation } from "./investigation";
import { unresolvedRevisionAlerts, type RevisionAlert, type ImpactAssessment } from "./revisions";

export interface OperationInput { reference: RfqReference; documents: QuoteDocument[]; poState?: PoState | undefined; configurationBlocked?: boolean | undefined; alerts?: RevisionAlert[] | undefined; assessments?: ImpactAssessment[] | undefined; investigations?: FailureInvestigation[] | undefined; approved?: boolean | undefined }
export interface OperationItem { id: string; label: string; count: number; tone: "neutral" | "warning" | "error" | "success"; details: string[]; action: string; step: number }
/** Current analysis only; saved RFQs are summarized independently under owner-only History. */
export function operationalSummary(input: OperationInput): OperationItem[] {
  const { reference, documents } = input;
  const pending = documents.filter((d) => !d.excluded && (!d.confirmed || quotationConfirmationErrors(d).length));
  const summary = poSummary(input.poState?.result, input.poState?.resolutions);
  const blockedPo = Boolean(input.poState?.po && (summary.blockers || input.poState.result?.validationErrors.length || input.configurationBlocked));
  const revisions = unresolvedRevisionAlerts(input.alerts ?? [], input.assessments ?? []);
  const expiring = documents.filter((d) => {
    const until = d.reviewed?.validity_end_date ?? d.original?.validity_end_date;
    return until && daysBetween(reference.today, until) >= 0 && daysBetween(reference.today, until) < 30;
  });
  const investigations = (input.investigations ?? []).filter((i) => !i.confirmed);
  return [
    { id: "attention", label: "RFQ requiring attention", count: pending.length ? 1 : 0, tone: pending.length ? "warning" : "neutral", details: pending.map((d) => `${d.fileName} · Awaiting buyer validation`), action: documents.length ? "Review quotations" : "Add quotations", step: documents.length ? 2 : 1 },
    { id: "po", label: "Blocked PO", count: blockedPo ? 1 : 0, tone: blockedPo ? "error" : "neutral", details: blockedPo ? [`${input.poState?.po?.poNumber ?? "PO"} · ${summary.blockers} critical discrepancies${input.configurationBlocked ? "; configuration review pending" : ""}`] : [], action: input.approved ? "Review PO & release" : "Record decision first", step: input.approved ? 5 : 4 },
    { id: "revisions", label: "New revisions", count: revisions.length, tone: revisions.length ? "warning" : "neutral", details: revisions.map(({ alert }) => `${alert.documentNumber} · Rev ${alert.previousRevision} → ${alert.newRevision}`), action: "Review revision impact", step: 6 },
    { id: "expiring", label: "Expiring quotations", count: expiring.length, tone: expiring.length ? "warning" : "neutral", details: expiring.map((d) => `${d.fileName} · Valid until ${d.reviewed?.validity_end_date ?? d.original?.validity_end_date}`), action: "Review quote validity", step: 2 },
    { id: "investigations", label: "Open investigations", count: investigations.length, tone: investigations.length ? "warning" : "neutral", details: investigations.map((i) => `${i.failureId} · ${i.suggested}`), action: "Open investigation", step: 8 },
  ];
}