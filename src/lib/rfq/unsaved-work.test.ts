import { describe, expect, it } from "vitest";
import { hasUnsavedWork, workspaceFingerprint, workspaceSaveStatus, SAVE_STATUS_LABEL } from "./unsaved-work";
const base = { reference: { rfqNumber: "", today: "" }, documents: [] as unknown[], poState: {} };
const pristine = { fingerprint: workspaceFingerprint(base), saved: false };
describe("unsaved work", () => {
  it("pristine workspace has no unsaved work and is labelled Not saved", () => {
    expect(hasUnsavedWork(workspaceFingerprint(base), pristine)).toBe(false);
    expect(SAVE_STATUS_LABEL[workspaceSaveStatus(workspaceFingerprint(base), pristine)]).toBe("Not saved");
  });
  it("automatic analysis date does not count as an edit", () => {
    const fp = workspaceFingerprint({ ...base, reference: { ...base.reference, today: "2026-11-10" } });
    expect(hasUnsavedWork(fp, pristine)).toBe(false);
  });
  it("editing RFQ setup is unsaved work", () => {
    const fp = workspaceFingerprint({ ...base, reference: { ...base.reference, rfqNumber: "RFQ-1" } });
    expect(workspaceSaveStatus(fp, pristine)).toBe("unsaved");
  });
  it("adding a quote is unsaved work", () => {
    expect(hasUnsavedWork(workspaceFingerprint({ ...base, documents: [{ id: "q" }] }), pristine)).toBe(true);
  });
  it("PO / decision changes are unsaved work", () => {
    expect(hasUnsavedWork(workspaceFingerprint({ ...base, poState: { po: { poNumber: "PO-1" } } }), pristine)).toBe(true);
  });
  it("an unsaved PO draft counts even when the workspace matches", () => {
    expect(hasUnsavedWork(workspaceFingerprint(base), pristine, true)).toBe(true);
  });
  it("right after a successful save there is no unsaved work and status is Saved", () => {
    const fp = workspaceFingerprint({ ...base, documents: [{ id: "q" }] });
    const saved = { fingerprint: fp, saved: true };
    expect(hasUnsavedWork(fp, saved)).toBe(false);
    expect(workspaceSaveStatus(fp, saved)).toBe("saved");
    expect(workspaceSaveStatus(workspaceFingerprint({ ...base, documents: [] }), saved)).toBe("unsaved");
  });
  it("no baseline yet means nothing to protect", () => {
    expect(hasUnsavedWork("x", { fingerprint: null, saved: false })).toBe(false);
  });
});
