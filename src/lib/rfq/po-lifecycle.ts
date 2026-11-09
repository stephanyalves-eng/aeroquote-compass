import { PO_FIELDS, poSummary } from "./po-check";
import type { PoState, PurchaseOrder } from "./po-types";
import type { AuditEvent } from "./review-types";

export type PoLifecycleStatus =
  | "Draft"
  | "Generated"
  | "Issued"
  | "Awaiting verification"
  | "Requires correction"
  | "Blocked"
  | "Verified"
  | "Awaiting release"
  | "Released"
  | "Superseded"
  | "Cancelled";
export interface PoVersion {
  po: PurchaseOrder;
  status: PoLifecycleStatus;
  revision: number;
  timestamp: string;
  actor: string;
}
export interface PoLifecycle {
  phase:
    | "Draft"
    | "Generated"
    | "Issued"
    | "Awaiting verification"
    | "Verified"
    | "Awaiting release"
    | "Cancelled";
  revision: number;
  updatedAt: string;
  actor: string;
  issued?: PurchaseOrder;
  history: PoVersion[];
}
export type PoLifecycleAction =
  | "Generate"
  | "Issue"
  | "Verify"
  | "Confirm verification"
  | "Prepare release"
  | "Release"
  | "Amend"
  | "Cancel";
export function lifecycleStatus(state: PoState, configurationBlocked = false): PoLifecycleStatus {
  const l = state.lifecycle;
  if (l?.phase === "Cancelled") return "Cancelled";
  if (!state.po) return "Draft";
  if (l?.phase === "Draft" || l?.phase === "Generated") return l.phase;
  const summary = poSummary(state.result, state.resolutions);
  if (
    state.result &&
    (summary.blockers || state.result.validationErrors.length || configurationBlocked)
  )
    return "Blocked";
  if (state.result && summary.discrepancies) return "Requires correction";
  if (state.released && summary.canRelease && !configurationBlocked) return "Released";
  if (l?.phase === "Verified" && summary.canRelease) return "Verified";
  if (state.result && summary.canRelease) return !l || l.phase === "Awaiting release" ? "Awaiting release" : "Verified";
  return l?.phase === "Issued" ? "Issued" : "Awaiting verification";
}
export const poEditingAllowed = (state: PoState) =>
  !state.lifecycle || state.lifecycle.phase === "Draft";
export const poVerificationAllowed = (state: PoState) =>
  Boolean(
    state.po &&
    (!state.lifecycle ||
      ["Issued", "Awaiting verification", "Verified", "Awaiting release"].includes(
        state.lifecycle.phase,
      )),
  );
export const poReleaseAllowed = (
  state: PoState,
  approved: boolean,
  configurationBlocked: boolean,
) =>
  approved &&
  !configurationBlocked &&
  poVerificationAllowed(state) &&
  poSummary(state.result, state.resolutions).canRelease &&
  (!state.lifecycle || state.lifecycle.phase === "Awaiting release") &&
  !state.released;

/** Validate PO administration without replacing the commercial verification engine. */
export function draftErrors(po: PurchaseOrder): string[] {
  const errors: string[] = [];
  for (const key of [
    "poNumber",
    "supplier",
    "partNumber",
    "revision",
    "quoteNumber",
    "rfqReference",
    "approvalReference",
    "buyer",
    "issueDate",
  ] as const) {
    if (!po[key].trim())
      errors.push(
        `${PO_FIELDS.find((f) => f.key === key)?.label ?? "Required field"} is required.`,
      );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(po.issueDate) ||
    !Number.isFinite(Date.parse(po.issueDate)) ||
    new Date(po.issueDate).toISOString().slice(0, 10) !== po.issueDate
  )
    errors.push("PO issue date must be a valid date.");
  for (const key of ["quantity", "unitPrice", "totalValue"] as const)
    if (po[key] == null || !Number.isFinite(po[key]) || Number(po[key]) <= 0)
      errors.push(`${PO_FIELDS.find((f) => f.key === key)?.label ?? "Amount"} must be positive.`);
  if (!po.currency || !["USD", "EUR", "BRL"].includes(po.currency))
    errors.push("Currency is required.");
  return errors;
}
export function startPoDraft(po: PurchaseOrder, timestamp: string, actor: string): PoState {
  return {
    po: structuredClone(po),
    tolerances: {
      roundingUsd: 1,
      unitPricePercent: 0.5,
      quantityUnits: 0,
      fxUpdatePercent: 2,
      logisticsPercent: 5,
      leadTimeDays: 0,
    },
    resolutions: [],
    released: false,
    lifecycle: { phase: "Draft", revision: 1, updatedAt: timestamp, actor, history: [] },
  };
}
export function savePoDraft(
  state: PoState,
  po: PurchaseOrder,
  timestamp: string,
  actor: string,
): PoState {
  if (!poEditingAllowed(state))
    throw new Error("Issued POs cannot be edited. Create an amendment first.");
  const errors = draftErrors(po);
  if (errors.length) throw new Error(errors.join(" "));
  return {
    ...state,
    po: structuredClone(po),
    result: undefined,
    resolutions: [],
    released: false,
    lifecycle: {
      ...(state.lifecycle ?? { revision: 1, history: [] }),
      phase: "Draft",
      updatedAt: timestamp,
      actor,
    },
  };
}
/** Checked evidence is authoritative; lifecycle transitions never accept discrepancies or correct fields. */
export function transitionPo(
  state: PoState,
  action: PoLifecycleAction,
  timestamp: string,
  actor: string,
  approved: boolean,
  configurationBlocked = false,
): PoState {
  if (!state.po || !approved)
    throw new Error("A purchase order linked to a valid approved decision is required.");
  const phase = state.lifecycle?.phase ?? "Awaiting release";
  const l: PoLifecycle = state.lifecycle ?? {
    phase,
    revision: 1,
    updatedAt: timestamp,
    actor,
    issued: structuredClone(state.po),
    history: [],
  };
  if (phase === "Cancelled") throw new Error("Cancelled POs cannot be changed.");
  const next: PoState = structuredClone(state);
  next.lifecycle = { ...structuredClone(l), updatedAt: timestamp, actor };
  if (action === "Amend") {
    if (!l.issued) throw new Error("Issue the PO before creating an amendment.");
    next.lifecycle = {
      phase: "Draft",
      revision: l.revision + 1,
      updatedAt: timestamp,
      actor,
      history: [
        ...l.history,
        {
          po: structuredClone(l.issued),
          status: "Superseded",
          revision: l.revision,
          timestamp,
          actor,
        },
      ],
    };
    next.po = {
      ...structuredClone(l.issued),
      poNumber: `${l.issued.poNumber.replace(/-R\d+$/, "")}-R${l.revision + 1}`,
    };
    next.result = undefined;
    next.resolutions = [];
    next.released = false;
    return next;
  }
  if (action === "Cancel") {
    if (state.released) throw new Error("Released POs cannot be cancelled; create an amendment.");
    next.lifecycle.phase = "Cancelled";
    next.released = false;
    return next;
  }
  if (state.released) throw new Error("Released POs are locked; create an amendment.");
  if (action === "Generate") {
    if (phase !== "Draft") throw new Error("Only a saved draft can be generated.");
    const errors = draftErrors(state.po);
    if (errors.length) throw new Error(errors.join(" "));
    next.lifecycle.phase = "Generated";
  } else if (action === "Issue") {
    if (phase !== "Generated") throw new Error("Generate the PO before issue.");
    next.lifecycle.phase = "Issued";
    next.lifecycle.issued = structuredClone(state.po);
    next.result = undefined;
    next.resolutions = [];
    next.released = false;
  } else if (action === "Verify") {
    if (!poVerificationAllowed(state)) throw new Error("Issue the PO before verification.");
    next.lifecycle.phase = "Awaiting verification";
  } else if (action === "Confirm verification" || action === "Prepare release") {
    if (
      !poVerificationAllowed(state) ||
      !poSummary(state.result, state.resolutions).canRelease ||
      configurationBlocked
    )
      throw new Error(
        "Resolve all PO and configuration discrepancies before verification or release.",
      );
    if (action === "Prepare release" && phase !== "Verified")
      throw new Error("Confirm verification before preparing release.");
    next.lifecycle.phase = action === "Confirm verification" ? "Verified" : "Awaiting release";
  } else if (action === "Release") {
    if (!poReleaseAllowed(state, approved, configurationBlocked))
      throw new Error("Verify the issued PO and prepare release first; resolve every discrepancy.");
    next.released = true;
  }
  return next;
}
export function lifecycleAudit(
  action: string,
  previous: PoState,
  next: PoState,
): Omit<AuditEvent, "id" | "timestamp" | "actor"> {
  return {
    action: `PO ${action.toLowerCase()}`,
    details: {
      poNumber: next.po?.poNumber,
      supplier: next.po?.supplier,
      status: lifecycleStatus(next),
      revision: String(next.lifecycle?.revision ?? 1),
      source: `Previous status: ${lifecycleStatus(previous)}`,
    },
  };
}
export function draftEditAudit(
  previous: PurchaseOrder | undefined,
  next: PurchaseOrder,
): Omit<AuditEvent, "id" | "timestamp" | "actor">[] {
  return PO_FIELDS.filter(
    (f) => JSON.stringify(previous?.[f.key]) !== JSON.stringify(next[f.key]),
  ).map((f) => ({
    action: "PO draft field saved",
    previousValue: previous?.[f.key] ?? null,
    newValue: next[f.key],
    details: { check: f.label, poNumber: next.poNumber },
  }));
}

export function poLifecycleSteps(state: PoState, configurationBlocked: boolean) {
  const issued = Boolean(state.po && (!state.lifecycle || state.lifecycle.issued));
  const generated = issued || state.lifecycle?.phase === "Generated";
  const checked = issued && Boolean(state.result);
  const summary = poSummary(state.result, state.resolutions);
  const reviewed = checked && summary.canRelease;
  const revisionVerified = reviewed && !configurationBlocked;
  const releaseReady =
    revisionVerified && (!state.lifecycle || state.lifecycle.phase === "Awaiting release");
  const evidence = [
    ["PO draft", Boolean(state.po), false],
    ["Generated", generated, false],
    ["Issued", issued, false],
    ["Verification", checked, false],
    ["Discrepancy review", reviewed, checked && !reviewed],
    ["Revision verification", revisionVerified, reviewed && configurationBlocked],
    ["Ready for release", releaseReady, false],
    ["Released", releaseReady && state.released, false],
  ] as const;
  let previousComplete = true;
  return evidence.map(([label, done, blocked]) => {
    const status =
      state.lifecycle?.phase === "Cancelled"
        ? "Cancelled"
        : previousComplete && done
          ? "Completed"
          : previousComplete && blocked
            ? "Blocked"
            : previousComplete
              ? "In progress"
              : "Not started";
    previousComplete = previousComplete && done;
    return { label, status };
  });
}
