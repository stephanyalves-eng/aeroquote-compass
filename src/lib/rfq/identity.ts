/** Header identity: never present the fictional demo buyer as a signed-in person. */
export const DEMO_BUYER_NAME = "Marina Costa";
export interface IdentityLabel { primary: string; secondary: string; signedIn: boolean }
export function identityLabel(user: { email?: string | null; name?: string | null } | null): IdentityLabel {
  const name = user?.name?.trim() || user?.email?.trim();
  if (!user || !name) return { primary: "Demo mode", secondary: `Fictional demo buyer: ${DEMO_BUYER_NAME}`, signedIn: false };
  return { primary: name, secondary: user.email && user.email !== name ? user.email : "Signed in", signedIn: true };
}
/** Record owner shown on the RFQ card. */
export function ownerLabel(user: { email?: string | null; name?: string | null } | null): string {
  const id = identityLabel(user);
  return id.signedIn ? id.primary : `${DEMO_BUYER_NAME} (fictional demo buyer)`;
}
/** Fictional actor credited to events recorded while signed out. */
export const DEMO_AUDIT_ACTOR = "Marina Costa (Demo buyer)";
/** Actor for every new audit event: signed-in name or email (never an internal id); otherwise the fictional demo buyer. */
export function auditActor(user: { email?: string | null; name?: string | null } | null): string {
  const id = identityLabel(user);
  return id.signedIn ? id.primary : DEMO_AUDIT_ACTOR;
}
