import type { AuditEvent } from "./review-types";
export const DEMO_BUYER = "Marina Costa (Demo buyer)";
/** Inject identity and timestamp so event construction is deterministic and testable. */
export function createAuditEvent(input: Omit<AuditEvent, "actor">): AuditEvent {
  return structuredClone({ ...input, actor: DEMO_BUYER });
}