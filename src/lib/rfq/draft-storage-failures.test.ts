import { describe, it, expect } from "vitest";
import { readDraft, writeDraft, clearDraft, shouldWarnBeforeUnload, DRAFT_STORAGE_KEY, DRAFT_SCHEMA_VERSION, type StorageLike } from "./draft-storage";

const throwing = (err = new Error("SecurityError")): StorageLike => ({ getItem: () => { throw err; }, setItem: () => { throw err; }, removeItem: () => { throw err; } });
const memory = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as StorageLike }; };

describe("draft storage failures", () => {
  it("unavailable storage (getItem/setItem/removeItem throw): pristine load, no crash", () => {
    expect(readDraft(throwing())).toBeNull();
    expect(writeDraft(throwing(), { a: 1 }, "t")).toBe(false);
    expect(() => clearDraft(throwing())).not.toThrow();
    expect(readDraft(null)).toBeNull();
    expect(writeDraft(null, {}, "t")).toBe(false);
  });
  it("quota exceeded on write returns false and keeps any prior value", () => {
    const quota = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    const { m, s } = memory();
    const full: StorageLike = { ...s, setItem: () => { throw quota; } };
    expect(writeDraft(full, { big: "x" }, "t")).toBe(false);
    expect(m.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
  it("corrupted JSON is ignored and cleared", () => {
    const { m, s } = memory({ [DRAFT_STORAGE_KEY]: "{not json" });
    expect(readDraft(s)).toBeNull();
    expect(m.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
  it("older schema version is ignored and cleared", () => {
    const { m, s } = memory({ [DRAFT_STORAGE_KEY]: JSON.stringify({ version: DRAFT_SCHEMA_VERSION - 1, savedAt: "t", workspace: { a: 1 } }) });
    expect(readDraft(s)).toBeNull();
    expect(m.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
  it("non-object or missing workspace is ignored", () => {
    for (const raw of ["null", "42", JSON.stringify({ version: DRAFT_SCHEMA_VERSION })]) {
      const { s } = memory({ [DRAFT_STORAGE_KEY]: raw });
      expect(readDraft(s)).toBeNull();
    }
  });
  it("current draft still round-trips", () => {
    const { s } = memory();
    expect(writeDraft(s, { a: 1 }, "t")).toBe(true);
    expect(readDraft<{ a: number }>(s)?.workspace.a).toBe(1);
  });
  it("leave-page warning fires when work could not be stored", () => {
    expect(shouldWarnBeforeUnload({ unsaved: true, poFormDirty: false, current: "fp", storedFingerprint: null })).toBe(true);
    expect(shouldWarnBeforeUnload({ unsaved: false, poFormDirty: false, current: "fp", storedFingerprint: null })).toBe(false);
    expect(shouldWarnBeforeUnload({ unsaved: true, poFormDirty: false, current: "fp", storedFingerprint: "fp" })).toBe(false);
  });
});
