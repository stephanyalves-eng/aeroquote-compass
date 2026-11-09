/** Configuration control: document revisions are traceable entities selected by dates and status, never by array order or text sorting. */
export type DocumentKind = "part" | "drawing" | "specification" | "rfq";
export type RevisionStatus = "Current" | "Superseded" | "Awaiting confirmation" | "Divergent" | "Not provided";
export interface DocumentRevision {
  id: string; kind: DocumentKind; documentNumber: string; revision: string; effectiveFrom: string; supersededOn: string | null;
  source: string; status: RevisionStatus; owner: string; changeReason: string; previousId: string | null; nextId: string | null;
}
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = { part: "Part", drawing: "Drawing", specification: "Specification", rfq: "RFQ" };
export const DEMO_DRAWING = "DWG-45210", DEMO_SPEC = "ES-1180", DEMO_RFQ = "RFQ-24410", DEMO_PART = "PN-45Y1258";

export function demoRevisionRegistry(): DocumentRevision[] {
  const r = (id: string, kind: DocumentKind, documentNumber: string, revision: string, effectiveFrom: string, supersededOn: string | null, owner: string, changeReason: string, previousId: string | null, nextId: string | null, source: string): DocumentRevision =>
    ({ id, kind, documentNumber, revision, effectiveFrom, supersededOn, source, status: supersededOn ? "Superseded" : "Current", owner, changeReason, previousId, nextId });
  return [
    r("part-c", "part", DEMO_PART, "C", "2026-08-01", null, "Rafael Lima (Demo engineer)", "Aligned with drawing Rev C.", null, null, "Synthetic PLM record"),
    r("dwg-b", "drawing", DEMO_DRAWING, "B", "2026-03-01", "2026-08-01", "Rafael Lima (Demo engineer)", "Initial production release.", null, "dwg-c", "Synthetic engineering vault"),
    r("dwg-c", "drawing", DEMO_DRAWING, "C", "2026-08-01", null, "Rafael Lima (Demo engineer)", "Seal groove tolerance tightened.", "dwg-b", null, "Synthetic engineering vault"),
    r("spec-3", "specification", DEMO_SPEC, "3", "2026-06-15", null, "Ana Duarte (Demo quality)", "Added AS9102 FAI requirement.", null, null, "Synthetic quality manual"),
    r("rfq-1", "rfq", DEMO_RFQ, "1", "2026-08-20", "2026-09-01", "Marina Costa (Demo buyer)", "Initial issue.", null, "rfq-2", "Synthetic sourcing system"),
    r("rfq-2", "rfq", DEMO_RFQ, "2", "2026-09-01", null, "Marina Costa (Demo buyer)", "Annual volume confirmed at 12 units.", "rfq-1", null, "Synthetic sourcing system"),
  ];
}
/** Revision in force at a date: effective on/before the date, not superseded by then, and not awaiting confirmation. Latest effective date wins. */
export function currentRevision(registry: DocumentRevision[], kind: DocumentKind, documentNumber: string, at: string): DocumentRevision | null {
  const c = registry.filter((r) => r.kind === kind && r.documentNumber === documentNumber && r.status !== "Awaiting confirmation" && r.effectiveFrom <= at && (!r.supersededOn || r.supersededOn > at));
  return c.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}
/** Publishes a new revision immutably; the previous current one becomes Superseded on the effective date. */
export function publishRevision(registry: DocumentRevision[], input: { kind: DocumentKind; documentNumber: string; revision: string; effectiveFrom: string; owner: string; changeReason: string; source?: string }): DocumentRevision[] {
  if (!input.revision.trim()) throw new Error("Revision is required.");
  if (!input.changeReason.trim()) throw new Error("A change reason is required.");
  if (registry.some((r) => r.kind === input.kind && r.documentNumber === input.documentNumber && r.revision === input.revision)) throw new Error(`Revision ${input.revision} already exists.`);
  const prev = currentRevision(registry, input.kind, input.documentNumber, input.effectiveFrom);
  const id = `${input.kind}-${input.documentNumber}-${input.revision}`;
  const next: DocumentRevision = { id, kind: input.kind, documentNumber: input.documentNumber, revision: input.revision, effectiveFrom: input.effectiveFrom, supersededOn: null, source: input.source ?? "Synthetic engineering vault", status: "Current", owner: input.owner, changeReason: input.changeReason, previousId: prev?.id ?? null, nextId: null };
  return [...registry.map((r) => r.id === prev?.id ? { ...r, supersededOn: input.effectiveFrom, status: "Superseded" as const, nextId: id } : r), next];
}
export const normRev = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/^REV(ISION)?\.?\s*/, "").trim();
export type RevisionComparison = "match" | "outdated" | "newer_or_unknown" | "missing";
export function compareRevision(registry: DocumentRevision[], kind: DocumentKind, documentNumber: string, found: string | null | undefined, at: string): RevisionComparison {
  if (!normRev(found)) return "missing";
  const current = currentRevision(registry, kind, documentNumber, at);
  if (current && normRev(current.revision) === normRev(found)) return "match";
  return registry.some((r) => r.kind === kind && r.documentNumber === documentNumber && normRev(r.revision) === normRev(found) && r.supersededOn && r.supersededOn <= at) ? "outdated" : "newer_or_unknown";
}

/* ---------- Immutable verification snapshots ---------- */
export type CheckType = "Buyer validation" | "Decision approval" | "PO verification" | "Configuration review" | "Inspection";
export interface ConfigurationSnapshot {
  readonly id: string; readonly timestamp: string; readonly checkType: CheckType; readonly actor: string; readonly supplier: string; readonly partNumber: string;
  readonly drawingNumber: string; readonly drawingRevision: string | null; readonly specificationId: string; readonly specificationVersion: string | null; readonly rfqVersion: string | null;
  readonly quoteRevision: string | null; readonly expectedRevision: string | null; readonly foundRevision: string | null; readonly sourceDocuments: readonly string[];
  readonly result: "Confirmed" | "Requires review" | "Blocker"; readonly divergences: readonly string[]; readonly tolerances: Readonly<Record<string, number>> | null;
  readonly justifications: readonly string[]; readonly finalStatus: string; readonly poNumber?: string | null;
}
function deepFreeze<T>(o: T): T { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; }
export function createSnapshot(registry: DocumentRevision[], input: Omit<ConfigurationSnapshot, "drawingRevision" | "specificationVersion" | "rfqVersion" | "expectedRevision" | "drawingNumber" | "specificationId"> & { at: string }): ConfigurationSnapshot {
  const { at, ...rest } = input;
  const dwg = currentRevision(registry, "drawing", DEMO_DRAWING, at), spec = currentRevision(registry, "specification", DEMO_SPEC, at), rfq = currentRevision(registry, "rfq", DEMO_RFQ, at);
  return deepFreeze(structuredClone({ ...rest, drawingNumber: DEMO_DRAWING, drawingRevision: dwg?.revision ?? null, specificationId: DEMO_SPEC, specificationVersion: spec?.revision ?? null, rfqVersion: rfq?.revision ?? null, expectedRevision: dwg?.revision ?? null }));
}
export const appendSnapshot = (list: readonly ConfigurationSnapshot[], s: ConfigurationSnapshot): ConfigurationSnapshot[] => [...list, s];

/* ---------- New revision detection + impact assessment ---------- */
export type ImpactLevel = "No known impact" | "Requires analysis" | "Requires new quotation" | "Requires recalculation" | "Requires new PO Check" | "Blocks release";
export const IMPACT_LEVELS: ImpactLevel[] = ["No known impact", "Requires analysis", "Requires new quotation", "Requires recalculation", "Requires new PO Check", "Blocks release"];
export interface RevisionAlert { key: string; documentNumber: string; previousRevision: string; newRevision: string; changedOn: string; affectedChecks: { id: string; checkType: CheckType; timestamp: string }[]; affectedStages: CheckType[]; message: string }
export interface ImpactAssessment { id: string; alertKey: string; level: ImpactLevel; justification: string; actor: string; timestamp: string }
export function detectRevisionChanges(registry: DocumentRevision[], snapshots: readonly ConfigurationSnapshot[], at: string): RevisionAlert[] {
  const current = currentRevision(registry, "drawing", DEMO_DRAWING, at);
  if (!current) return [];
  const stale = snapshots.filter((s) => s.drawingRevision && normRev(s.drawingRevision) !== normRev(current.revision));
  const groups = new Map<string, ConfigurationSnapshot[]>();
  for (const s of stale) groups.set(s.drawingRevision!, [...(groups.get(s.drawingRevision!) ?? []), s]);
  return [...groups.entries()].map(([prev, checks]) => {
    const latest = checks.reduce((a, b) => (b.timestamp >= a.timestamp ? b : a));
    return { key: `${DEMO_DRAWING}:${prev}->${current.revision}`, documentNumber: DEMO_DRAWING, previousRevision: prev, newRevision: current.revision, changedOn: current.effectiveFrom,
      affectedChecks: checks.map((c) => ({ id: c.id, checkType: c.checkType, timestamp: c.timestamp })), affectedStages: [...new Set(checks.map((c) => c.checkType))],
      message: `${latest.checkType} was completed against revision ${prev}. Revision ${current.revision} became current afterwards. Re-evaluate the quotation and PO before manufacturing.` };
  });
}
export function createImpactAssessment(alert: RevisionAlert, level: ImpactLevel, justification: string, actor: string, timestamp: string): ImpactAssessment {
  if (!justification.trim()) throw new Error("A justification is required for every impact assessment.");
  return { id: `${alert.key}@${timestamp}`, alertKey: alert.key, level, justification: justification.trim(), actor, timestamp };
}
/** Latest assessment per alert decides; only "No known impact" clears release. */
export function unresolvedRevisionAlerts(alerts: RevisionAlert[], assessments: ImpactAssessment[]): { alert: RevisionAlert; assessment: ImpactAssessment | null }[] {
  return alerts.map((alert) => ({ alert, assessment: assessments.filter((a) => a.alertKey === alert.key).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null }))
    .filter((x) => x.assessment?.level !== "No known impact");
}

/* ---------- Configuration gate applied on top of the PO Check ---------- */
export interface ConfigurationGateItem { id: string; label: string; expected: string; found: string; status: "confirmed" | "requires_review" | "blocker"; reason: string }
export function configurationGate(input: { registry: DocumentRevision[]; at: string; poRevision: string | null | undefined; poRfqVersion?: string | null; poDrawingRevision?: string | null; quoteRevision: string | null | undefined; documentReferences?: string[]; alerts: RevisionAlert[]; assessments: ImpactAssessment[] }): ConfigurationGateItem[] {
  const { registry, at } = input, items: ConfigurationGateItem[] = [];
  const dwg = currentRevision(registry, "drawing", DEMO_DRAWING, at), rfq = currentRevision(registry, "rfq", DEMO_RFQ, at);
  const add = (id: string, label: string, expected: string | null | undefined, found: string | null | undefined, status: ConfigurationGateItem["status"], reason: string) => items.push({ id, label, expected: expected || "Not provided", found: found || "Not provided", status, reason });
  const rev = (id: string, label: string, found: string | null | undefined) => { const c = compareRevision(registry, "drawing", DEMO_DRAWING, found, at);
    add(id, label, dwg?.revision, found, c === "match" ? "confirmed" : "blocker", c === "match" ? "Matches the current drawing revision." : c === "missing" ? "Revision missing: release blocked." : c === "outdated" ? "Revision is superseded: release blocked." : "Revision not found in the configuration registry: release blocked."); };
  rev("po-revision", "PO part revision", input.poRevision);
  rev("po-drawing", "PO drawing revision", input.poDrawingRevision ?? input.poRevision);
  rev("quote-revision", "Quotation revision", input.quoteRevision);
  const rfqFound = input.poRfqVersion ?? rfq?.revision ?? null;
  add("rfq-version", "RFQ version", rfq?.revision, rfqFound, rfq && rfqFound === rfq.revision ? "confirmed" : "blocker", rfq && rfqFound === rfq.revision ? "RFQ version is current." : "RFQ has been superseded or version missing.");
  const refs = input.documentReferences ?? [DEMO_DRAWING, DEMO_SPEC];
  for (const doc of [DEMO_DRAWING, DEMO_SPEC]) add(`trace-${doc}`, `Traceability: ${doc}`, "Referenced on PO", refs.includes(doc) ? "Referenced" : "Not referenced", refs.includes(doc) ? "confirmed" : "blocker", refs.includes(doc) ? "Mandatory document referenced." : "Mandatory document lacks traceability on the PO.");
  for (const { alert, assessment } of unresolvedRevisionAlerts(input.alerts, input.assessments))
    add(`alert-${alert.key}`, "New revision impact", `Assessment of Rev ${alert.newRevision}`, assessment ? assessment.level : "Not assessed", "blocker", assessment ? `Impact assessed as "${assessment.level}": re-evaluation required before release.` : "A current drawing revision has not been assessed.");
  return items;
}
export const gateBlocked = (items: ConfigurationGateItem[]) => items.some((i) => i.status === "blocker");
export function verificationStatement(registry: DocumentRevision[], at: string, date: string): string {
  const dwg = currentRevision(registry, "drawing", DEMO_DRAWING, at), rfq = currentRevision(registry, "rfq", DEMO_RFQ, at);
  const d = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `PO verified against drawing ${DEMO_DRAWING}, revision ${dwg?.revision ?? "not provided"}, and ${DEMO_RFQ}, version ${rfq?.revision ?? "not provided"}, on ${d}.`;
}

/* ---------- Revision matrix ---------- */
export interface MatrixRow { stage: string; expected: string; found: string; checkedAt: string | null; status: "Confirmed" | "Blocker" | "Divergence" | "Not checked" | "Superseded"; firstBreak: boolean }
export function revisionMatrix(registry: DocumentRevision[], at: string, stages: { stage: string; found: string | null | undefined; checkedAt: string | null; blockerOnMismatch?: boolean }[]): MatrixRow[] {
  const expected = currentRevision(registry, "drawing", DEMO_DRAWING, at)?.revision ?? "Not provided";
  let broken = false;
  return stages.map((s) => {
    const status: MatrixRow["status"] = s.checkedAt == null && !s.found ? "Not checked" : normRev(s.found) === normRev(expected) ? "Confirmed" : s.blockerOnMismatch ? "Blocker" : "Divergence";
    const firstBreak = !broken && (status === "Blocker" || status === "Divergence"); if (firstBreak) broken = true;
    return { stage: s.stage, expected, found: s.found ? String(s.found) : "Not provided", checkedAt: s.checkedAt, status, firstBreak };
  });
}
