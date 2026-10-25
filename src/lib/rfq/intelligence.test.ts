import { describe, expect, it } from "vitest";
import { compareDocuments, DEFAULT_WEIGHTS, decisionInsights, validWeights } from "./intelligence";
import { canCompare, confidenceLevel, MAX_FILES, newReference, referenceErrors, type QuoteDocument } from "./workflow";
import { fileError } from "./files";
import { analyzeQuote } from "./rules";
import type { ExtractedQuote } from "./types";
const ref = { ...newReference(), rfqNumber: "RFQ-1", partNumber: "PN-1", revision: "C", today: "2026-10-25" };
const quote: ExtractedQuote = { supplier_name: "ACME LLC", quote_id: "Q1", quote_date: "2026-10-01", validity_end_date: "2027-01-01", part_number: "PN-1", revision: "C", unit_price: 100, currency: "USD", quantity_basis: 12, price_breaks: [], incoterm: "FCA", incoterm_place: null, lead_time_days: 90, payment_terms_days: 60, one_time_costs: [], certifications: ["AS9100D"], fai_included: true, eccn: "9A991", warranty_months: 24, new_supplier_requires_qualification: false, surcharge_clause: null, notes: null };
const doc = (patch: Partial<ExtractedQuote> = {}): QuoteDocument => ({ id: "1", text: "", fileName: "q.txt", fileType: "txt", status: "Extracted", original: quote, reviewed: { ...quote, ...patch }, confirmed: true });
describe("AeroQuote deterministic rules", () => {
  it("allows at most 20 files", () => expect(MAX_FILES).toBe(20));
  it.each(["pdf", "xlsx", "xls", "csv", "txt"])("accepts %s", (type) => expect(fileError(`quote.${type}`, 100)).toBeNull());
  it("rejects unsupported files", () => expect(fileError("quote.exe", 100)).toContain("Unsupported"));
  it("requires essential RFQ fields", () => expect(referenceErrors(newReference()).length).toBeGreaterThan(0));
  it("blocks unconfirmed or partly failed analyses", () => {
    expect(canCompare([doc()], ref)).toBe(true);
    expect(canCompare([{ ...doc(), confirmed: false }], ref)).toBe(false);
    expect(canCompare([doc(), { ...doc(), status: "Error" }], ref)).toBe(false);
  });
  it.each([[90, "High"], [89, "Medium"], [70, "Medium"], [69, "Review Required"], [null, "Not provided"]] as const)("confidence %s yields %s", (n, result) => expect(confidenceLevel(n)).toBe(result));
  it("uses the requested default weights", () => expect(DEFAULT_WEIGHTS).toEqual({ cost: 40, leadTime: 20, risk: 15, payment: 10, compliance: 10, commercial: 5 }));
  it("requires weights to sum to exactly 100", () => { expect(validWeights(DEFAULT_WEIGHTS)).toBe(true); expect(validWeights({ ...DEFAULT_WEIGHTS, cost: 39 })).toBe(false); });
  it("preserves legacy cost and keeps its combined adder explicitly separate", () => {
    const a = compareDocuments([doc()], ref, DEFAULT_WEIGHTS)[0];
    expect(a?.annualLanded).toBe(analyzeQuote(quote, ref).annualTotalUsd);
    expect(a?.annualLanded).toBe(1248); expect(a?.combinedEstimate).toBe(48);
    expect(a?.freight).toBeNull(); expect(a?.insurance).toBeNull(); expect(a?.estimated).toBe(true);
  });
  it("uses quoted logistics without double-counting the legacy adder", () => {
    const a = compareDocuments([doc({ freight: 100, insurance: 20, duties: 30, other_adders: 10, one_time_costs: [{ type: "NRE", amount: 50, currency: "USD" }] })], ref, DEFAULT_WEIGHTS)[0];
    expect(a?.annualLanded).toBe(1410); expect(a?.combinedEstimate).toBeNull();
    expect(a?.baseline.annualTotalUsd).toBe(1298);
  });
  it("does not turn missing partial logistics into a complete recommendation", () => {
    const a = compareDocuments([doc({ freight: 100 })], ref, DEFAULT_WEIGHTS)[0]; expect(a?.incomplete).toBe(true); expect(a?.eligible).toBe(false);
  });
  it("reports insufficient risk data", () => expect(compareDocuments([doc({ lead_time_days: null })], ref, DEFAULT_WEIGHTS)[0]?.risk).toBe("Insufficient data"));
  it("keeps critical mismatch unawardable", () => {
    const list = compareDocuments([doc({ revision: "B" })], ref, DEFAULT_WEIGHTS);
    expect(list[0]?.eligible).toBe(false); expect(decisionInsights(list, ref).recommended).toBeNull();
  });
  it("scores 0–100 and recommends highest eligible score", () => {
    const list = compareDocuments([doc({ supplier_name: "A LLC", freight: 0, insurance: 0 }), doc({ supplier_name: "B LLC", unit_price: 200, freight: 0, insurance: 0 })], ref, DEFAULT_WEIGHTS);
    expect(list[0]?.score).toBe(100); expect(list[1]?.score).toBe(80); expect(decisionInsights(list, ref).recommended?.name).toBe("A LLC");
  });
  it("does not invent savings without incumbent or target", () => expect(decisionInsights(compareDocuments([doc()], ref, DEFAULT_WEIGHTS), ref).savings).toBeNull());
  it("derives savings from the incumbent quote", () => {
    const r = { ...ref, incumbentSupplier: "B LLC" }; const list = compareDocuments([doc({ supplier_name: "A LLC" }), doc({ supplier_name: "B LLC", unit_price: 200 })], r, DEFAULT_WEIGHTS);
    expect(decisionInsights(list, r).savings).toBe(1248);
  });
});