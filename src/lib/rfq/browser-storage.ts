import type { StorageLike } from "./draft-storage";

const PROBE_KEY = "aeroquote-compass:storage-probe";
export const STORAGE_BLOCKED_MESSAGE = "Your browser is blocking site storage, so sign-in is unavailable. The demo, comparison and exports keep working.";

/** Testable probe with an injected storage getter; catches access and operation errors. */
export function probeBrowserStorage(getStorage: () => StorageLike | null): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(PROBE_KEY, PROBE_KEY);
    const matches = storage.getItem(PROBE_KEY) === PROBE_KEY;
    storage.removeItem(PROBE_KEY);
    return matches;
  } catch {
    return false;
  }
}
export function cachedStorageProbe(probe: () => boolean): () => boolean {
  let available: boolean | undefined;
  return () => (available ??= probe());
}
const browserProbe = cachedStorageProbe(() => probeBrowserStorage(() => window.localStorage));
/** Cache only browser results, never the SSR fallback. Call after hydration or from actions. */
export function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && browserProbe();
}
/** Block callback evaluation, including auth-client property access, when unavailable. */
export function withStorageAuth<T>(available: boolean, access: () => T): T | undefined {
  return available ? access() : undefined;
}