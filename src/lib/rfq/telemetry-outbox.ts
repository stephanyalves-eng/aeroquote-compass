/** Pure outbox decision for weekly recommendation milestones. */
export type OutboxAction = "delivered" | "drop" | "retry";
export function outboxAction(
  error: { code?: string | null } | null | undefined,
  milestone: { synthetic: boolean },
): OutboxAction {
  if (!error) return "delivered";
  // Real milestones from anonymous visitors are rejected by the server permanently; never retry them.
  if (!milestone.synthetic && error.code === "42501") return "drop";
  return "retry";
}
