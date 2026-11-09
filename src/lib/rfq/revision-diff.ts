import { DOCUMENT_KIND_LABELS, type DocumentRevision, type ConfigurationSnapshot, type RevisionAlert, type ImpactAssessment } from "./revisions";

const FIELDS = [
  ["revision", "Revision"], ["effectiveFrom", "Effective date"], ["source", "Source"], ["owner", "Document owner"], ["changeReason", "Engineering change reason"],
] as const;
/** Only recorded metadata can be compared; never infer engineering changes from prose. */
export function revisionDiff(registry: readonly DocumentRevision[], snapshots: readonly ConfigurationSnapshot[], alert: RevisionAlert, assessments: readonly ImpactAssessment[]) {
  const previous = registry.find((r) => r.documentNumber === alert.documentNumber && r.revision === alert.previousRevision);
  const next = registry.find((r) => r.documentNumber === alert.documentNumber && r.revision === alert.newRevision);
  const fields = FIELDS.flatMap(([key, label]) => previous?.[key] === next?.[key] ? [] : [{ label, previous: previous?.[key] ?? "Not provided", next: next?.[key] ?? "Not provided" }]);
  const ids = new Set(alert.affectedChecks.map((c) => c.id));
  const checks = snapshots.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, label: s.checkType, supplier: s.supplier, timestamp: s.timestamp, previous: s.drawingRevision ?? "Not provided", next: alert.newRevision, po: s.poNumber ?? "Not provided" }));
  const assessment = [...assessments].filter((a) => a.alertKey === alert.key).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  return { previous: previous?.revision ?? alert.previousRevision, next: next?.revision ?? alert.newRevision, kind: next ? DOCUMENT_KIND_LABELS[next.kind] : "Document", document: alert.documentNumber, fields, checks,
    documents: [...new Set([alert.documentNumber, ...snapshots.filter((s) => ids.has(s.id)).flatMap((s) => [...s.sourceDocuments])])],
    impact: assessment?.level ?? "Not yet assessed", justification: assessment?.justification ?? "Not yet recorded", engineeringDetail: "Field-level engineering specifications are not recorded; the registered change reason is shown without inferred dimensions or tolerances." };
}