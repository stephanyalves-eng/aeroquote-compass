import type { QuoteDocument } from "./workflow";
import { quotationConfirmationErrors } from "./review-issues";
import { daysBetween } from "./rules";
import { poSummary } from "./po-check";
import { lifecycleStatus } from "./po-lifecycle";
import type { PoState } from "./po-types";
import type { RfqReference } from "./types";
import type { FailureInvestigation } from "./investigation";
import {
  unresolvedRevisionAlerts,
  detectRevisionChanges,
  configurationGate,
  gateBlocked,
  type DocumentRevision,
  type ConfigurationSnapshot,
  type RevisionAlert,
  type ImpactAssessment,
} from "./revisions";

export interface OperationInput {
  reference: RfqReference;
  documents: QuoteDocument[];
  poState?: PoState | undefined;
  configurationBlocked?: boolean | undefined;
  alerts?: RevisionAlert[] | undefined;
  assessments?: ImpactAssessment[] | undefined;
  investigations?: FailureInvestigation[] | undefined;
  approved?: boolean | undefined;
}
export interface OperationItem {
  id: string;
  label: string;
  count: number;
  tone: "neutral" | "warning" | "error" | "success";
  details: string[];
  action: string;
  step: number;
}
/**
 * Synthetic demo investigations, revision alerts and configuration blocks only count as the
 * buyer's items when a demo sample is loaded; a user's own RFQ never inherits them.
 */
export function scopeSyntheticEvidence(input: OperationInput): OperationInput {
  if (input.reference.demoAnalysis) return input;
  return { ...input, investigations: [], alerts: [], assessments: [], configurationBlocked: false };
}
export function savedOperationalSummary(
  snapshot: {
    reference: RfqReference;
    documents: QuoteDocument[];
    poState?: PoState | undefined;
    approvedDecision?: { supplierId: string } | undefined;
    configuration?:
      | {
          registry: DocumentRevision[];
          snapshots: ConfigurationSnapshot[];
          assessments: ImpactAssessment[];
          investigations?: FailureInvestigation[] | undefined;
        }
      | undefined;
  },
  today: string,
) {
  const config = snapshot.configuration;
  const at =
    [
      snapshot.reference.demoAnalysis ? snapshot.reference.today : today,
      ...(config?.registry ?? []).map((r) => r.effectiveFrom),
    ]
      .sort()
      .at(-1) ?? today;
  const alerts = detectRevisionChanges(config?.registry ?? [], config?.snapshots ?? [], at);
  const approvedQuote = snapshot.documents.find(
    (d) => d.id === snapshot.approvedDecision?.supplierId,
  )?.reviewed;
  const blocked = Boolean(
    config &&
    snapshot.poState?.po &&
    gateBlocked(
      configurationGate({
        registry: config.registry,
        at,
        poRevision: snapshot.poState.po.revision,
        quoteRevision: approvedQuote?.revision,
        alerts,
        assessments: config.assessments,
      }),
    ),
  );
  return operationalSummary(scopeSyntheticEvidence({
    reference: {
      ...snapshot.reference,
      today: snapshot.reference.demoAnalysis ? snapshot.reference.today : today,
    },
    documents: snapshot.documents,
    poState: snapshot.poState,
    configurationBlocked: blocked,
    alerts,
    assessments: config?.assessments,
    investigations: config?.investigations,
    approved: Boolean(snapshot.approvedDecision),
  }));
}
export type AttentionSeverity = "Critical" | "High" | "Medium";
export interface AttentionItem {
  id: string;
  process: string;
  reason: string;
  owner: string;
  due: string | null;
  severity: AttentionSeverity;
  nextAction: string;
  step: number;
}
const SEVERITY_ORDER: Record<AttentionSeverity, number> = { Critical: 0, High: 1, Medium: 2 };
/**
 * "Requires attention" list for the ERP dashboard, ordered by severity then due date.
 * Derived from the same evidence as operationalSummary; never from navigation state.
 */
export function requiresAttention(input: OperationInput): AttentionItem[] {
  const { reference, documents } = input;
  const items: AttentionItem[] = [];
  const pending = documents.filter(
    (d) => !d.excluded && (!d.confirmed || quotationConfirmationErrors(d).length),
  );
  const summary = poSummary(input.poState?.result, input.poState?.resolutions);
  const blockedPo = Boolean(
    input.poState?.po &&
    (summary.blockers ||
      input.poState.result?.validationErrors.length ||
      input.configurationBlocked),
  );
  const revisions = unresolvedRevisionAlerts(input.alerts ?? [], input.assessments ?? []);
  const expiring = documents.filter((d) => {
    const until = d.reviewed?.validity_end_date ?? d.original?.validity_end_date;
    return (
      until && daysBetween(reference.today, until) >= 0 && daysBetween(reference.today, until) < 30
    );
  });
  const investigations = (input.investigations ?? []).filter((i) => !i.confirmed);
  const comparisonReady =
    documents.length > 0 &&
    documents.every((d) => d.original && d.reviewed) &&
    pending.length === 0;

  if (blockedPo)
    items.push({
      id: "po-blocked",
      process: "Purchase Order",
      reason: `${input.poState?.po?.poNumber ?? "PO"} has ${summary.blockers} critical ${summary.blockers === 1 ? "discrepancy" : "discrepancies"}${input.configurationBlocked ? " and a pending configuration review" : ""}.`,
      owner: "Marina Costa (Demo buyer)",
      due: reference.requiredDeliveryDate ?? null,
      severity: "Critical",
      nextAction: "Review PO discrepancies",
      step: 5,
    });
  if (pending.length)
    items.push({
      id: "validation",
      process: "Buyer Validation",
      reason: `${pending.length} ${pending.length === 1 ? "quotation" : "quotations"} awaiting buyer validation.`,
      owner: "Marina Costa (Demo buyer)",
      due: null,
      severity: "High",
      nextAction: "Validate quotations",
      step: 2,
    });
  if (comparisonReady && !input.approved)
    items.push({
      id: "decision",
      process: "Decision",
      reason: "Comparison is complete; the sourcing decision has not been recorded.",
      owner: "Marina Costa (Demo buyer)",
      due: null,
      severity: "High",
      nextAction: "Record decision",
      step: 4,
    });
  if (
    input.poState?.lifecycle &&
    !input.poState.released &&
    input.poState.lifecycle.phase !== "Cancelled" &&
    !blockedPo
  ) {
    const status = lifecycleStatus(input.poState, Boolean(input.configurationBlocked));
    items.push({
      id: "po-lifecycle",
      process: "Purchase Order",
      reason: `${input.poState.po?.poNumber ?? "PO"} · ${status}.`,
      owner: input.poState.lifecycle.actor,
      due: reference.requiredDeliveryDate ?? null,
      severity: status === "Requires correction" ? "High" : "Medium",
      nextAction:
        status === "Draft"
          ? "Generate PO"
          : status === "Generated"
            ? "Issue PO"
            : status === "Awaiting release"
              ? "Release purchase"
              : status === "Requires correction"
                ? "Review discrepancies"
                : "Verify PO",
      step: 5,
    });
  }
  for (const { alert } of revisions)
    items.push({
      id: `revision-${alert.key}`,
      process: "Configuration",
      reason: `${alert.documentNumber} revised ${alert.previousRevision} → ${alert.newRevision}; impact not assessed.`,
      owner: "Rafael Lima (Demo engineer)",
      due: null,
      severity: "High",
      nextAction: "Assess revision impact",
      step: 6,
    });
  for (const d of expiring)
    items.push({
      id: `expiring-${d.id}`,
      process: "Quotations",
      reason: `${d.fileName} validity ends soon.`,
      owner: "Marina Costa (Demo buyer)",
      due: d.reviewed?.validity_end_date ?? d.original?.validity_end_date ?? null,
      severity: "Medium",
      nextAction: "Review quote validity",
      step: 2,
    });
  for (const i of investigations)
    items.push({
      id: `investigation-${i.failureId}`,
      process: "Investigation",
      reason: `${i.failureId} · suggested classification: ${i.suggested}.`,
      owner: "Rafael Lima (Demo engineer)",
      due: null,
      severity: "Medium",
      nextAction: "Open investigation",
      step: 8,
    });
  return items.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999"),
  );
}

/** Current analysis only; saved RFQs are summarized independently under owner-only History. */
export function operationalSummary(input: OperationInput): OperationItem[] {
  const { reference, documents } = input;
  const pending = documents.filter(
    (d) => !d.excluded && (!d.confirmed || quotationConfirmationErrors(d).length),
  );
  const summary = poSummary(input.poState?.result, input.poState?.resolutions);
  const blockedPo = Boolean(
    input.poState?.po &&
    (summary.blockers ||
      input.poState.result?.validationErrors.length ||
      input.configurationBlocked),
  );
  const revisions = unresolvedRevisionAlerts(input.alerts ?? [], input.assessments ?? []);
  const expiring = documents.filter((d) => {
    const until = d.reviewed?.validity_end_date ?? d.original?.validity_end_date;
    return (
      until && daysBetween(reference.today, until) >= 0 && daysBetween(reference.today, until) < 30
    );
  });
  const investigations = (input.investigations ?? []).filter((i) => !i.confirmed);
  return [
    {
      id: "attention",
      label: "RFQ requiring attention",
      count: pending.length ? 1 : 0,
      tone: pending.length ? "warning" : "neutral",
      details: pending.map((d) => `${d.fileName} · Awaiting buyer validation`),
      action: documents.length ? "Review quotations" : "Add quotations",
      step: documents.length ? 2 : 1,
    },
    {
      id: "po",
      label: "Blocked PO",
      count: blockedPo ? 1 : 0,
      tone: blockedPo ? "error" : "neutral",
      details: blockedPo
        ? [
            `${input.poState?.po?.poNumber ?? "PO"} · ${summary.blockers} critical discrepancies${input.configurationBlocked ? "; configuration review pending" : ""}`,
          ]
        : [],
      action: input.approved ? "Review PO & release" : "Record decision first",
      step: input.approved ? 5 : 4,
    },
    {
      id: "revisions",
      label: "New revisions",
      count: revisions.length,
      tone: revisions.length ? "warning" : "neutral",
      details: revisions.map(
        ({ alert }) =>
          `${alert.documentNumber} · Rev ${alert.previousRevision} → ${alert.newRevision}`,
      ),
      action: "Review revision impact",
      step: 6,
    },
    {
      id: "expiring",
      label: "Expiring quotations",
      count: expiring.length,
      tone: expiring.length ? "warning" : "neutral",
      details: expiring.map(
        (d) =>
          `${d.fileName} · Valid until ${d.reviewed?.validity_end_date ?? d.original?.validity_end_date}`,
      ),
      action: "Review quote validity",
      step: 2,
    },
    {
      id: "investigations",
      label: "Open investigations",
      count: investigations.length,
      tone: investigations.length ? "warning" : "neutral",
      details: investigations.map((i) => `${i.failureId} · ${i.suggested}`),
      action: "Open investigation",
      step: 8,
    },
  ];
}
