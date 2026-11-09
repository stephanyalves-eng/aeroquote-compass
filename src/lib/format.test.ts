import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, formatPercent, formatDays, formatDate } from "./format";
describe("format", () => {
  it("uses en-US separators", () => { expect(formatCurrency(230256)).toBe("$230,256"); expect(formatNumber(0.5, 1)).toBe("0.5"); expect(formatPercent(3.24)).toBe("3.2%"); });
  it("never invents values", () => { expect(formatCurrency(null)).toBe("Not provided"); expect(formatDays(undefined)).toBe("Not provided"); expect(formatDate("")).toBe("Not provided"); });
  it("formats days and dates", () => { expect(formatDays(150)).toBe("150 days"); expect(formatDate("2027-03-15")).toBe("Mar 15, 2027"); });
});
