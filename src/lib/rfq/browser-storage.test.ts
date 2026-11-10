import { describe, expect, it, vi } from "vitest";
import { cachedStorageProbe, isBrowserStorageAvailable, probeBrowserStorage, withStorageAuth } from "./browser-storage";
import type { StorageLike } from "./draft-storage";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    setItem: (key, value) => { values.set(key, value); },
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
  };
}
describe("Browser storage capability", () => {
  it("returns false on SSR", () => {
    expect(isBrowserStorageAvailable()).toBe(false);
  });
  it("requires a successful write, read and removal", () => {
    const storage = memoryStorage();
    const set = vi.spyOn(storage, "setItem");
    const get = vi.spyOn(storage, "getItem");
    const remove = vi.spyOn(storage, "removeItem");
    expect(probeBrowserStorage(() => storage)).toBe(true);
    const key = set.mock.calls[0]?.[0];
    expect(key).toBe("aeroquote-compass:storage-probe");
    expect(get).toHaveBeenCalledWith(key);
    expect(remove).toHaveBeenCalledWith(key);
    expect(storage.getItem(String(key))).toBeNull();
  });
  it("returns false for unavailable storage", () => {
    expect(probeBrowserStorage(() => null)).toBe(false);
  });
  it("catches a throwing localStorage getter", () => {
    expect(probeBrowserStorage(() => { throw new Error("blocked"); })).toBe(false);
  });
  for (const method of ["setItem", "getItem", "removeItem"] as const) {
    it(`returns false when ${method} throws`, () => {
      const storage = memoryStorage();
      vi.spyOn(storage, method).mockImplementation(() => { throw new Error("blocked or full"); });
      expect(probeBrowserStorage(() => storage)).toBe(false);
    });
  }
  it("rejects silently failed writes and cleans up the key", () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {});
    const remove = vi.spyOn(storage, "removeItem");
    expect(probeBrowserStorage(() => storage)).toBe(false);
    expect(remove).toHaveBeenCalledOnce();
  });
  for (const result of [false, true]) {
    it(`caches ${result} for the page lifetime`, () => {
      const probe = vi.fn().mockReturnValueOnce(result).mockReturnValue(!result);
      const cached = cachedStorageProbe(probe);
      expect(cached()).toBe(result);
      expect(cached()).toBe(result);
      expect(probe).toHaveBeenCalledOnce();
    });
  }
});
describe("Storage auth gate", () => {
  it("never evaluates an auth callback when storage is blocked", () => {
    const auth = vi.fn(() => { throw new Error("Auth must not initialize"); });
    expect(withStorageAuth(false, auth)).toBeUndefined();
    expect(auth).not.toHaveBeenCalled();
  });
  it("returns the callback result when storage is available", () => {
    const auth = vi.fn(() => "session");
    expect(withStorageAuth(true, auth)).toBe("session");
    expect(auth).toHaveBeenCalledOnce();
  });
});