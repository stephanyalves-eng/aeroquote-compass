import type { ConfigurationSnapshot, DocumentRevision } from "./revisions";
import { currentRevision, normRev, DEMO_DRAWING } from "./revisions";
export interface InspectionFailure { id: string; part: string; lot: string; supplier: string; poNumber: string; date: string; type: "Receiving inspection" | "Quality" | "Field return"; description: string; revisionFound: string | null; evidence: string[]; impact: string; status: "Open" | "Classification confirmed" | "Closed" }
export type FailureClassification = "Documentation changed after verification" | "Existing divergence not detected" | "Process correct, failure unrelated to documentation" | "Insufficient evidence";
export const CLASSIFICATION_HELP: Record<FailureClassification, string> = {
  "Documentation changed after verification": "The check was correct against the revision in force, but a newer revision appeared later and was not incorporated.",
  "Existing divergence not detected": "The incorrect information already existed at verification time, but the check passed.",
  "Process correct, failure unrelated to documentation": "The document chain was consistent; no evidence links the failure to a revision.",
  "Insufficient evidence": "The available data cannot determine the cause.",
};
export interface FailureInvestigation { failureId: string; suggested: FailureClassification; evidence: string[]; revisionAtManufacture: string | null; confirmed: FailureClassification | null; confirmedBy: string | null; note: string }
/** Suggests a preliminary classification from immutable snapshots. Never assigns blame; the buyer must confirm. */
export function investigateFailure(failure: InspectionFailure, snapshots: readonly ConfigurationSnapshot[], registry: DocumentRevision[], manufacturedOn: string): FailureInvestigation {
  const check = [...snapshots].filter((s) => s.checkType === "PO verification" && (!s.poNumber || s.poNumber === failure.poNumber) && s.timestamp.slice(0, 10) <= failure.date).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const atMfg = currentRevision(registry, "drawing", DEMO_DRAWING, manufacturedOn)?.revision ?? null;
  const evidence: string[] = [];
  const base = { failureId: failure.id, revisionAtManufacture: atMfg, confirmed: null, confirmedBy: null, note: "" };
  if (!check || !failure.revisionFound) { evidence.push(check ? "Revision found on the failed part was not recorded." : "No PO verification snapshot exists for this PO before the failure date."); return { ...base, suggested: "Insufficient evidence", evidence }; }
  evidence.push(`PO verification on ${check.timestamp.slice(0, 10)}: expected Rev ${check.expectedRevision ?? "—"}, found Rev ${check.foundRevision ?? "—"}, result ${check.result}.`);
  evidence.push(`Revision in force at manufacture (${manufacturedOn}): Rev ${atMfg ?? "not provided"}. Revision on failed part: Rev ${failure.revisionFound}.`);
  const checkMatched = normRev(check.foundRevision) === normRev(check.expectedRevision);
  if (check.result !== "Blocker" && !checkMatched) return { ...base, suggested: "Existing divergence not detected", evidence: [...evidence, "The divergence existed when the check passed."] };
  if (checkMatched && atMfg && normRev(atMfg) !== normRev(check.expectedRevision) && normRev(failure.revisionFound) === normRev(check.expectedRevision)) return { ...base, suggested: "Documentation changed after verification", evidence: [...evidence, `Revision ${atMfg} became current after the check and was not incorporated.`] };
  if (checkMatched && normRev(failure.revisionFound) === normRev(atMfg)) return { ...base, suggested: "Process correct, failure unrelated to documentation", evidence: [...evidence, "The document chain was consistent from check to manufacture."] };
  return { ...base, suggested: "Insufficient evidence", evidence };
}
export function confirmClassification(inv: FailureInvestigation, classification: FailureClassification, actor: string, note: string): FailureInvestigation {
  if (classification !== inv.suggested && !note.trim()) throw new Error("Explain why the confirmed classification differs from the suggestion.");
  return { ...inv, confirmed: classification, confirmedBy: actor, note: note.trim() };
}
