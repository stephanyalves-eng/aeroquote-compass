import type { StageStatus } from "./workflow-stages";

export type MainStepStatus = "Not started" | "In progress" | "Needs attention" | "Blocked" | "Complete";
export interface MainStep { index: number; label: string; detail: string[]; status: MainStepStatus; stages: { label: string; status: StageStatus }[] }
export const MAIN_STEPS = [
  { label: "RFQ Setup", detail: ["RFQ details", "Demo data"], stages: [] as string[] },
  { label: "Quotes", detail: ["Upload quotes", "AI extraction", "Extraction results"], stages: ["Quotes received", "AI extraction"] },
  { label: "Buyer Validation", detail: ["Missing-data review", "Field confirmation"], stages: ["Buyer review"] },
  { label: "Compare", detail: ["Supplier shortlist", "Landed cost", "Score and risk"], stages: ["Comparison & calculation"] },
  { label: "Decision", detail: ["Recommendation", "Alternatives", "Risks", "Decision approval"], stages: ["Recommendation", "Decision approved"] },
  { label: "PO & Release", detail: ["PO creation/upload", "PO verification", "Revision verification", "Release readiness"], stages: ["PO creation/upload", "PO Check", "Release before manufacturing"] },
] as const;
export const TRACEABILITY = ["Configuration and revisions", "Audit trail", "Investigation"] as const;
/** Navigation index of the first Traceability view; main steps occupy 0-5. */
export const TRACE_OFFSET = MAIN_STEPS.length;

const done = (s: StageStatus) => s === "Confirmed" || s === "Received" || s === "Extracted";

/** Groups the eleven evidence stages into six operational steps; a step is never complete while an earlier one is not. */
export function mainSteps(stages: { label: string; status: StageStatus }[], setupValid: boolean): MainStep[] {
  let previousComplete = true;
  return MAIN_STEPS.map((m, index) => {
    const own = stages.filter((s) => (m.stages as readonly string[]).includes(s.label));
    let status: MainStepStatus;
    if (index === 0) status = setupValid ? "Complete" : "In progress";
    else if (own.some((s) => s.status === "Blocked")) status = "Blocked";
    else if (own.length && own.every((s) => done(s.status))) status = "Complete";
    else if (own.some((s) => s.status === "In review")) status = "Needs attention";
    else if (own.some((s) => s.status !== "Pending")) status = "In progress";
    else status = "Not started";
    if (status === "Complete" && !previousComplete) status = "In progress";
    previousComplete = status === "Complete";
    return { index, label: m.label, detail: [...m.detail], status, stages: own };
  });
}

export interface ProgressSummary { current: MainStep; position: string; overall: string; next: string; blockers: string[]; completed: number }
const NEXT: Record<number, string> = {
  0: "Complete the RFQ details, then add quotes.",
  1: "Upload quotes and run AI extraction.",
  2: "Confirm critical fields for each quotation.",
  3: "Review landed costs, scores and risks.",
  4: "Record the sourcing decision.",
  5: "Load the PO, resolve discrepancies and release.",
};
export function progressSummary(steps: MainStep[], currentIndex: number, blockers: string[]): ProgressSummary {
  const current = steps[Math.min(Math.max(currentIndex, 0), steps.length - 1)]!;
  const completed = steps.filter((s) => s.status === "Complete").length;
  const firstOpen = steps.find((s) => s.status !== "Complete");
  const overall = blockers.length || steps.some((s) => s.status === "Blocked") ? "Blocked" : completed === steps.length ? "Released" : completed === 0 ? "Not started" : "In progress";
  return { current, position: `Step ${current.index + 1} of ${steps.length}`, overall, next: firstOpen ? `${firstOpen.label}: ${NEXT[firstOpen.index]}` : "Purchase released. Monitor revisions in Traceability.", blockers, completed };
}
