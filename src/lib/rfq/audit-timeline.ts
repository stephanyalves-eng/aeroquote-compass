import type { AuditEvent } from "./review-types";
import { describeAudit } from "./audit-describe";
import type { ConfigurationSnapshot, DocumentRevision, ImpactAssessment } from "./revisions";
import type { InspectionFailure, FailureInvestigation } from "./investigation";

export interface TimelineEvent { id: string; timestamp: string; type: string; document: string; revision: string; actor: string; stage: string; result: string; impact: string; related: string[]; supplier: string; partNumber: string; poNumber: string }
const TYPE_BY_ACTION: Record<string, string> = { "Extraction completed": "Quotation received", "Field edited": "Quotation validated", "Quotation confirmed": "Quotation validated", "Bulk confirm": "Quotation validated",
  "Recommended supplier": "Supplier recommended", "Final decision": "Decision approved", "PO created": "PO created", "PO loaded": "PO created", "PO check executed": "PO Check executed", "PO released": "PO released", "PO blocked": "PO Check executed" };
export function buildTimeline(input: { registry: DocumentRevision[]; snapshots: readonly ConfigurationSnapshot[]; audit: AuditEvent[]; assessments: ImpactAssessment[]; failures: InspectionFailure[]; investigations: FailureInvestigation[]; supplierOf: (documentId?: string) => string; partNumber: string }): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const r of input.registry) {
    const type = r.kind === "rfq" ? (r.previousId ? "New RFQ version" : "RFQ created") : r.previousId ? "New revision published" : `${r.kind === "drawing" ? "Drawing" : r.kind === "specification" ? "Specification" : "Part"} received`;
    out.push({ id: `rev-${r.id}`, timestamp: `${r.effectiveFrom}T09:00:00.000Z`, type, document: r.documentNumber, revision: r.revision, actor: r.owner, stage: "Configuration review", result: r.status, impact: r.changeReason, related: r.previousId ? [`rev-${r.previousId}`] : [], supplier: "—", partNumber: input.partNumber, poNumber: "—" });
  }
  for (const s of input.snapshots) out.push({ id: `snap-${s.id}`, timestamp: s.timestamp, type: s.checkType === "PO verification" ? "PO Check executed" : s.checkType, document: s.drawingNumber, revision: s.foundRevision ?? "Not provided", actor: s.actor, stage: s.checkType, result: s.result, impact: s.divergences.join(" ") || "No divergence recorded.", related: [], supplier: s.supplier, partNumber: s.partNumber, poNumber: s.poNumber ?? "—" });
  for (const e of input.audit) { const type = TYPE_BY_ACTION[e.action] ?? e.action; const d = (e.details ?? {}) as Record<string, unknown>;
    const stage = /PO/.test(e.action) ? "PO verification" : /revision|Impact/i.test(e.action) ? "Configuration review" : /Investigation/.test(e.action) ? "Investigation" : /Weights|Landed|Recommend|decision|override/i.test(e.action) ? "Decision" : "Buyer validation";
    out.push({ id: `audit-${e.id}`, timestamp: e.timestamp, type, document: String(d["fileName"] ?? d["poNumber"] ?? d["document"] ?? "—"), revision: String(d["revision"] ?? "—"), actor: e.actor, stage, result: e.action, impact: describeAudit(e), related: [], supplier: input.supplierOf(e.documentId), partNumber: input.partNumber, poNumber: String(d["poNumber"] ?? "—") }); }
  for (const a of input.assessments) out.push({ id: `impact-${a.id}`, timestamp: a.timestamp, type: "Later change detected", document: a.alertKey.split(":")[0] ?? "—", revision: a.alertKey.split("->")[1] ?? "—", actor: a.actor, stage: "Configuration review", result: a.level, impact: a.justification, related: [], supplier: "—", partNumber: input.partNumber, poNumber: "—" });
  for (const f of input.failures) out.push({ id: `fail-${f.id}`, timestamp: `${f.date}T10:00:00.000Z`, type: "Inspection failure", document: f.lot, revision: f.revisionFound ?? "Not provided", actor: "Ana Duarte (Demo quality)", stage: "Inspection", result: f.type, impact: f.impact, related: [], supplier: f.supplier, partNumber: f.part, poNumber: f.poNumber });
  for (const i of input.investigations) if (i.confirmed) { const f = input.failures.find((x) => x.id === i.failureId); out.push({ id: `inv-${i.failureId}`, timestamp: `${f?.date ?? "2026-12-01"}T16:00:00.000Z`, type: "Investigation concluded", document: f?.lot ?? "—", revision: i.revisionAtManufacture ?? "—", actor: i.confirmedBy ?? "—", stage: "Investigation", result: i.confirmed, impact: i.note || "—", related: [`fail-${i.failureId}`], supplier: f?.supplier ?? "—", partNumber: f?.part ?? input.partNumber, poNumber: f?.poNumber ?? "—" }); }
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.timestamp.localeCompare(b.e.timestamp) || a.i - b.i).map(({ e }) => e);
}
export interface TimelineFilter { supplier: string; partNumber: string; document: string; revision: string; poNumber: string; type: string }
export const EMPTY_TIMELINE_FILTER: TimelineFilter = { supplier: "", partNumber: "", document: "", revision: "", poNumber: "", type: "" };
export const filterTimeline = (events: TimelineEvent[], f: TimelineFilter) => events.filter((e) => (Object.keys(f) as (keyof TimelineFilter)[]).every((k) => !f[k] || e[k] === f[k]));
