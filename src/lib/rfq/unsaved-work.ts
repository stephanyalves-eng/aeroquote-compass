/** Pure save-state logic for the in-memory workspace (no React, no storage). */
export interface WorkspaceParts {
  reference: { today?: string } & Record<string, unknown>;
  [key: string]: unknown;
}
/** Stable fingerprint of user work. The analysis date is excluded: it is set automatically, not by the user. */
export function workspaceFingerprint(parts: WorkspaceParts): string {
  const { today: _today, ...reference } = parts.reference;
  return JSON.stringify({ ...parts, reference });
}
export type WorkspaceSaveStatus = "pristine" | "unsaved" | "saved";
export interface SaveBaseline {
  /** Fingerprint of the pristine workspace, or of the last successful save/reopen. */
  fingerprint: string | null;
  saved: boolean;
}
export function hasUnsavedWork(current: string, baseline: SaveBaseline, draftDirty = false): boolean {
  if (draftDirty) return true;
  if (baseline.fingerprint == null) return false;
  return current !== baseline.fingerprint;
}
export function workspaceSaveStatus(current: string, baseline: SaveBaseline, draftDirty = false): WorkspaceSaveStatus {
  if (hasUnsavedWork(current, baseline, draftDirty)) return "unsaved";
  return baseline.saved ? "saved" : "pristine";
}
export const SAVE_STATUS_LABEL: Record<WorkspaceSaveStatus, string> = {
  pristine: "Not saved",
  unsaved: "Unsaved changes",
  saved: "Saved",
};
