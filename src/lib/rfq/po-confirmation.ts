import type { PoState, PurchaseOrder } from "./po-types";
import type { AuditEvent } from "./review-types";

export interface SupplierConfirmation {
  poFingerprint: string;
  confirmedOn: string;
  expectedDelivery: string;
  reference: string;
  timestamp: string;
  actor: string;
}
export type ConfirmationInput = Pick<
  SupplierConfirmation,
  "confirmedOn" | "expectedDelivery" | "reference"
>;
const fingerprint = (po: PurchaseOrder) => JSON.stringify(po);
export function currentSupplierConfirmation(
  state: PoState,
  po = state.lifecycle?.issued ?? state.po,
) {
  if (!po) return undefined;
  return [...(state.supplierConfirmations ?? [])]
    .reverse()
    .find((c) => c.poFingerprint === fingerprint(po));
}
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;
export function recordSupplierConfirmation(
  state: PoState,
  input: ConfirmationInput,
  timestamp: string,
  actor: string,
): PoState {
  const po = state.lifecycle?.issued ?? state.po;
  if (
    !po ||
    (state.lifecycle && (!state.lifecycle.issued || state.lifecycle.phase === "Cancelled"))
  )
    throw new Error("Issue the PO before recording supplier confirmation.");
  if (!validDate(input.confirmedOn)) throw new Error("Confirmation date must be a valid date.");
  if (!validDate(input.expectedDelivery))
    throw new Error("Expected delivery date must be a valid date.");
  if (input.confirmedOn < po.issueDate)
    throw new Error("Confirmation date cannot precede the PO issue date.");
  if (input.expectedDelivery < input.confirmedOn)
    throw new Error("Expected delivery cannot precede supplier confirmation.");
  const confirmation: SupplierConfirmation = {
    ...input,
    reference: input.reference.trim(),
    poFingerprint: fingerprint(po),
    timestamp,
    actor,
  };
  return {
    ...state,
    supplierConfirmations: [...(state.supplierConfirmations ?? []), confirmation],
  };
}
export function supplierConfirmationAudit(
  previous: PoState,
  next: PoState,
): Omit<AuditEvent, "id" | "timestamp" | "actor"> {
  const before = currentSupplierConfirmation(previous),
    after = currentSupplierConfirmation(next);
  const describe = (c: SupplierConfirmation | undefined) =>
    c
      ? `Confirmation date: ${c.confirmedOn}; expected delivery: ${c.expectedDelivery}; reference: ${c.reference || "Not provided"}`
      : "Not yet recorded";
  return {
    action: "PO supplier confirmation recorded",
    previousValue: describe(before),
    newValue: describe(after),
    details: { poNumber: next.po?.poNumber, supplier: next.po?.supplier },
  };
}
