import { createSnapshot, demoRevisionRegistry, publishRevision, type ConfigurationSnapshot, type DocumentRevision } from "./revisions";
import type { InspectionFailure } from "./investigation";
export interface InvestigationCase { id: string; title: string; registry: DocumentRevision[]; snapshots: ConfigurationSnapshot[]; failure: InspectionFailure; manufacturedOn: string }
const QA = "Ana Duarte (Demo quality)", BUYER = "Marina Costa (Demo buyer)";
const poCheck = (registry: DocumentRevision[], id: string, at: string, found: string, result: ConfigurationSnapshot["result"], poNumber: string, supplier: string) =>
  createSnapshot(registry, { id, at, timestamp: `${at}T14:00:00.000Z`, checkType: "PO verification", actor: BUYER, supplier, partNumber: "PN-45Y1258", quoteRevision: found, foundRevision: found, sourceDocuments: ["DWG-45210", "ES-1180", "RFQ-24410"], result, divergences: [], tolerances: null, justifications: [], finalStatus: result === "Confirmed" ? "PO checked and released" : "PO blocked", poNumber });
/** Three synthetic failure cases with their own immutable history. */
export function demoInvestigationCases(): InvestigationCase[] {
  const base = demoRevisionRegistry();
  const withD = publishRevision(base, { kind: "drawing", documentNumber: "DWG-45210", revision: "D", effectiveFrom: "2026-11-15", owner: "Rafael Lima (Demo engineer)", changeReason: "Port thread changed to MJ12." });
  return [
    { id: "case-a", title: "Revision changed after a correct PO Check", registry: withD, snapshots: [poCheck(withD, "chk-a", "2026-11-09", "C", "Confirmed", "DEMO-PO-7001", "Horizon Precision LLC")], manufacturedOn: "2026-11-25",
      failure: { id: "fail-a", part: "PN-45Y1258", lot: "LOT-A-1201", supplier: "Horizon Precision LLC", poNumber: "DEMO-PO-7001", date: "2026-12-10", type: "Receiving inspection", description: "Port thread does not accept MJ12 gauge.", revisionFound: "C", evidence: ["Synthetic gauge report GR-118", "Certificate of conformity states Rev C"], impact: "12 units quarantined.", status: "Open" } },
    { id: "case-b", title: "Divergence existed but the check passed", registry: base, snapshots: [{ ...poCheck(base, "chk-b", "2026-11-09", "B", "Confirmed", "DEMO-PO-7002", "Boreal Dynamics GMBH") }], manufacturedOn: "2026-11-20",
      failure: { id: "fail-b", part: "PN-45Y1258", lot: "LOT-B-0877", supplier: "Boreal Dynamics GMBH", poNumber: "DEMO-PO-7002", date: "2026-12-04", type: "Quality", description: "Seal groove machined to the old Rev B tolerance.", revisionFound: "B", evidence: ["Synthetic CMM report CMM-552", "PO line shows Rev B"], impact: "Rework of 4 units.", status: "Open" } },
    { id: "case-c", title: "Failure unrelated to documentation", registry: base, snapshots: [poCheck(base, "chk-c", "2026-11-09", "C", "Confirmed", "DEMO-PO-7003", "Delta Fluid Power INC")], manufacturedOn: "2026-11-22",
      failure: { id: "fail-c", part: "PN-45Y1258", lot: "LOT-C-3310", supplier: "Delta Fluid Power INC", poNumber: "DEMO-PO-7003", date: "2026-12-08", type: "Receiving inspection", description: "Surface scratches from packaging during transport.", revisionFound: "C", evidence: ["Synthetic photo set PH-09", "Packaging deviation note"], impact: "2 units returned.", status: "Open" } },
  ];
}
