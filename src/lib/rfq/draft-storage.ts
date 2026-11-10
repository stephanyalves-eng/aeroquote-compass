/** Versioned local draft of the in-memory workspace. Pure helpers; storage is injected and every access is guarded. */
export const DRAFT_STORAGE_KEY = "aeroquote-compass:workspace-draft";
export const DRAFT_SCHEMA_VERSION = 1;
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface DraftEnvelope<W> {
  version: number;
  savedAt: string;
  workspace: W;
}
/** Returns window.localStorage when it exists and is usable, otherwise null (private mode, SSR, blocked storage). */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
/** Writes the draft; returns false instead of throwing when storage is unavailable or full. */
export function writeDraft<W>(storage: StorageLike | null, workspace: W, savedAt: string): boolean {
  if (!storage) return false;
  try {
    const envelope: DraftEnvelope<W> = { version: DRAFT_SCHEMA_VERSION, savedAt, workspace };
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}
/** Reads a draft of the current schema version; corrupt, foreign or older drafts are ignored. */
export function readDraft<W>(storage: StorageLike | null): DraftEnvelope<W> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    let parsed: Partial<DraftEnvelope<W>> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<DraftEnvelope<W>>;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || parsed.version !== DRAFT_SCHEMA_VERSION || !parsed.workspace || typeof parsed.workspace !== "object") {
      clearDraft(storage); // Corrupted, foreign or older draft: drop it so it is not re-read.
      return null;
    }
    return { version: parsed.version, savedAt: String(parsed.savedAt ?? ""), workspace: parsed.workspace };
  } catch {
    return null;
  }
}
export function clearDraft(storage: StorageLike | null): void {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* Storage unavailable: nothing to clear. */
  }
}
/** JSON turns NaN into null; restore blank numeric RFQ inputs as NaN so they stay "not entered" and fail validation. */
export function reviveReferenceNumbers<R extends Record<string, unknown>>(reference: R): R {
  const out: Record<string, unknown> = { ...reference };
  for (const key of ["annualVolume", "usdBrl", "eurBrl"]) if (out[key] === null || out[key] === undefined) out[key] = Number.NaN;
  const adders = out["incotermAdders"] as Record<string, unknown> | undefined;
  if (adders && typeof adders === "object")
    out["incotermAdders"] = Object.fromEntries(Object.entries(adders).map(([k, v]) => [k, v === null ? Number.NaN : v]));
  return out as R;
}
/**
 * The browser leave-page warning only fires when work could be lost:
 * an unsaved PO form, or unsaved workspace changes whose latest state is not in the local draft.
 */
export function shouldWarnBeforeUnload(input: { unsaved: boolean; poFormDirty: boolean; current: string; storedFingerprint: string | null }): boolean {
  if (input.poFormDirty) return true;
  return input.unsaved && input.storedFingerprint !== input.current;
}
