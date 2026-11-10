import type { ErpProcessStep } from "./erp-nav";
import type { RfqStatus } from "./workflow";

/** Tracker stage that must be completed before each RFQ status is accurate. */
const REQUIRED_STAGE: Record<RfqStatus, string | null> = {
  Draft: null,
  Analyzing: "Quotes received",
  "Under Negotiation": "Comparison complete",
  Awarded: "Decision approved",
  Completed: "Released",
};
const ORDER: RfqStatus[] = ["Draft", "Analyzing", "Under Negotiation", "Awarded", "Completed"];
const done = (steps: ErpProcessStep[], label: string | null) =>
  label == null || steps.find((s) => s.label === label)?.status === "Completed";

/** Most advanced status supported by workflow evidence (the same eight-stage tracker the buyer sees). */
export function suggestedRfqStatus(steps: ErpProcessStep[]): RfqStatus {
  return [...ORDER].reverse().find((s) => done(steps, REQUIRED_STAGE[s])) ?? "Draft";
}
/** Explains when a manually chosen status is ahead of the tracker; null when consistent or behind. */
export function rfqStatusMismatch(chosen: RfqStatus, steps: ErpProcessStep[]): string | null {
  const stage = REQUIRED_STAGE[chosen];
  if (done(steps, stage)) return null;
  const tracker = steps.find((s) => s.label === stage);
  return `"${chosen}" is ahead of recorded progress: ${stage} is ${tracker?.status.toLowerCase() ?? "not started"}. Suggested status: ${suggestedRfqStatus(steps)}.`;
}
/** Tracker stage each workflow screen belongs to (index into the eight process stages). */
const VIEW_STAGE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 9: 7 };
/** Page eyebrow derived from the same tracker shown on screen, e.g. "Stage 3 of 8 · Buyer validation". */
export function viewProgressLabel(step: number, steps: ErpProcessStep[]): string {
  const index = VIEW_STAGE[step];
  if (index == null || !steps[index]) return "Traceability";
  return `Stage ${index + 1} of ${steps.length} · ${steps[index].label}`;
}
