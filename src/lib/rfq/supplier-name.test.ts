import { describe, expect, it } from "vitest";
import { normalizeSupplierName } from "./supplier-name";

describe("supplier name presentation", () => {
  it.each([
    ["POLAR AEROSPACE INC (FICTITIOUS)", "Polar Aerospace INC"],
    ["Helix Precision SA (FICTÍCIO)", "Helix Precision SA"],
    ["ATLAS CONTROLS INC (FICTICIO)", "Atlas Controls INC"],
  ])("normalizes %s", (raw, name) => {
    expect(normalizeSupplierName(raw)).toEqual({ name, isFictitious: true });
  });
  it.each(["INC", "SA", "LTDA", "GMBH", "LLC"])("keeps %s uppercase", (suffix) => {
    expect(normalizeSupplierName(`ACME AEROSPACE ${suffix}`).name).toBe(`Acme Aerospace ${suffix}`);
  });
  it("detects a marker in source text even if extraction omitted it", () => {
    expect(normalizeSupplierName("POLAR AEROSPACE INC", "POLAR AEROSPACE INC (FICTITIOUS) - Quote"))
      .toEqual({ name: "Polar Aerospace INC", isFictitious: true });
  });
  it("does not label an unmarked supplier fictitious", () => {
    expect(normalizeSupplierName("ACME LLC", "ACME LLC - Quote"))
      .toEqual({ name: "Acme LLC", isFictitious: false });
  });
  it("preserves mixed-case names and normalizes their suffix", () => {
    expect(normalizeSupplierName("McDonald Aerospace GmbH").name).toBe("McDonald Aerospace GMBH");
  });
  it.each(["[fictional]", "(fictícia)", "(FICTICIO - sample)"])("strips similar marker %s", (marker) => {
    expect(normalizeSupplierName(`ACME LLC ${marker}`)).toEqual({ name: "Acme LLC", isFictitious: true });
  });
  it("handles missing names without inventing one", () => {
    expect(normalizeSupplierName(null)).toEqual({ name: null, isFictitious: false });
  });
});