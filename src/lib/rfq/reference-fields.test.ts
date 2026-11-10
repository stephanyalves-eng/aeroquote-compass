import { describe, expect, it } from "vitest";
import { firstInvalidField, referenceFieldErrors } from "./reference-fields";
import { newReference } from "./workflow";
const valid = { ...newReference(), rfqNumber: "RFQ-1", partNumber: "PN-1", revision: "C", requiredCertification: "AS9100", today: "2026-11-10", annualVolume: 12 };
describe("RFQ setup field errors", () => {
  it("a valid reference has no field errors", () => {
    expect(referenceFieldErrors(valid)).toEqual({});
    expect(firstInvalidField(valid)).toBeNull();
  });
  it("ties the annual volume message to the volume field", () => {
    expect(referenceFieldErrors({ ...valid, annualVolume: 1.5 }).annualVolume).toBe("Annual volume must be a positive whole number.");
  });
  it("ties the exchange-rate message to both rate fields", () => {
    const e = referenceFieldErrors({ ...valid, usdBrl: 0 });
    expect(e.usdBrl).toBe("Exchange rates must be positive numbers.");
    expect(e.eurBrl).toBe("Exchange rates must be positive numbers.");
  });
  it("focus goes to the first invalid field in form order", () => {
    expect(firstInvalidField({ ...valid, partNumber: "", usdBrl: 0 })).toBe("partNumber");
    expect(firstInvalidField({ ...valid, usdBrl: NaN })).toBe("usdBrl");
  });
});
