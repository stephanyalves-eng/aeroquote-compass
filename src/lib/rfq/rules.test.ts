import { describe, expect, it } from "vitest";
import { analyzeQuote, applicableUnitPrice, computeAlerts, DEFAULT_INCOTERM_ADDERS, rankQuotes, riskLevel, toUsd } from "./rules";
import type { ExtractedQuote, RfqReference } from "./types";

const ref: RfqReference = {
  rfqNumber: "RFQ-24410",
  partNumber: "PN-45Y1258",
  revision: "C",
  annualVolume: 12,
  requiredCertification: "AS9100D",
  usdBrl: 5.1447,
  eurBrl: 5.9186,
  incotermAdders: DEFAULT_INCOTERM_ADDERS,
  today: "2026-10-25",
};

const base: ExtractedQuote = {
  supplier_name: "Test", quote_id: "Q1", quote_date: "2026-10-01", validity_end_date: "2027-01-31",
  part_number: "PN-45Y1258", revision: "C", unit_price: 1000, currency: "USD", quantity_basis: 12,
  price_breaks: [], incoterm: "DAP", incoterm_place: null, lead_time_days: 90, payment_terms_days: 60,
  one_time_costs: [], certifications: ["AS9100D"], fai_included: true, eccn: "9A991", warranty_months: 12,
  new_supplier_requires_qualification: false, surcharge_clause: null, notes: null,
};

describe("FX", () => {
  it("converts EUR via BRL cross rate", () => {
    expect(toUsd(100, "EUR", ref)).toBeCloseTo((100 * 5.9186) / 5.1447, 6);
  });
  it("converts BRL", () => expect(toUsd(5.1447, "BRL", ref)).toBeCloseTo(1, 6));
});

describe("price breaks", () => {
  it("uses base price below break", () => {
    expect(applicableUnitPrice({ ...base, unit_price: 18450, price_breaks: [{ min_qty: 24, unit_price: 17900 }] }, 12)).toBe(18450);
  });
  it("uses break price at or above min qty", () => {
    expect(applicableUnitPrice({ ...base, unit_price: 18450, price_breaks: [{ min_qty: 24, unit_price: 17900 }] }, 24)).toBe(17900);
  });
});

describe("annual total cost", () => {
  it("goods + freight adder + one-time costs", () => {
    const a = analyzeQuote({ ...base, unit_price: 17250, incoterm: "EXW", one_time_costs: [{ type: "Tooling", amount: 6500, currency: "USD" }] }, ref);
    expect(a.annualGoodsUsd).toBe(207000);
    expect(a.freightUsd).toBeCloseTo(12420, 6);
    expect(a.annualTotalUsd).toBeCloseTo(225920, 6);
  });
  it("CPT uses 1.5%", () => {
    expect(analyzeQuote({ ...base, incoterm: "CPT" }, ref).freightUsd).toBeCloseTo(180, 6);
  });
});

const codes = (q: Partial<ExtractedQuote>) => computeAlerts({ ...base, ...q }, ref).map((a) => `${a.code}:${a.severity}`);

describe("alerts", () => {
  it("revision mismatch is HIGH", () => expect(codes({ revision: "B" })).toContain("REVISION:HIGH"));
  it("missing certification is HIGH", () => expect(codes({ certifications: ["ISO 9001"] })).toContain("CERTIFICATION:HIGH"));
  it("ECCN null is MEDIUM", () => expect(codes({ eccn: null })).toContain("ECCN:MEDIUM"));
  it("new supplier is MEDIUM", () => expect(codes({ new_supplier_requires_qualification: true })).toContain("QUALIFICATION:MEDIUM"));
  it("expired is HIGH", () => expect(codes({ validity_end_date: "2026-10-15" })).toContain("EXPIRED:HIGH"));
  it("expiring in <30 days is MEDIUM", () => expect(codes({ validity_end_date: "2026-11-07" })).toContain("EXPIRING:MEDIUM"));
  it("30+ days is no validity alert", () => expect(codes({ validity_end_date: "2026-11-24" }).some((c) => c.startsWith("EXPIR"))).toBe(false));
  it("one-time cost is INFO", () => expect(codes({ one_time_costs: [{ type: "FAI", amount: 2800, currency: "EUR" }] })).toContain("ONE_TIME_COST:INFO"));
  it("surcharge is MEDIUM", () => expect(codes({ surcharge_clause: "aluminum index" })).toContain("SURCHARGE:MEDIUM"));
  it("lead time 121 is MEDIUM, 120 is not", () => {
    expect(codes({ lead_time_days: 121 })).toContain("LEAD_TIME:MEDIUM");
    expect(codes({ lead_time_days: 120 })).not.toContain("LEAD_TIME:MEDIUM");
  });
});

describe("risk and ranking", () => {
  it("risk levels", () => {
    expect(riskLevel([{ code: "x", severity: "HIGH", message: "" }])).toBe("High");
    expect(riskLevel([{ code: "x", severity: "MEDIUM", message: "" }])).toBe("Medium");
    expect(riskLevel([{ code: "x", severity: "INFO", message: "" }])).toBe("Low");
  });
  it("ranks by total ascending, HIGH still ranked but not awardable", () => {
    const cheapBad = analyzeQuote({ ...base, unit_price: 500, revision: "B" }, ref, 0);
    const pricey = analyzeQuote({ ...base, unit_price: 900 }, ref, 1);
    const r = rankQuotes([pricey, cheapBad]);
    expect(r[0].index).toBe(0);
    expect(r[0].rank).toBe(1);
    expect(r[0].awardable).toBe(false);
    expect(r[1].awardable).toBe(true);
  });
});
