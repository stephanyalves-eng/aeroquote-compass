import { describe, expect, it } from "vitest";
import { compareDocuments, DEFAULT_WEIGHTS, decisionInsights, validWeights } from "./intelligence";
import { canCompare, confidenceLevel, extractQueue, localToday, MAX_FILES, newReference, referenceErrors, type QuoteDocument } from "./workflow";
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
  it("requires weights to sum to 100 within a 0.01 tolerance", () => {
    expect(validWeights(DEFAULT_WEIGHTS)).toBe(true);
    expect(validWeights({ cost: 33.3, leadTime: 33.3, risk: 33.4, payment: 0, compliance: 0, commercial: 0 })).toBe(true);
    expect(validWeights({ ...DEFAULT_WEIGHTS, cost: 39.9 })).toBe(false);
  });
  it("uses the local calendar date, not UTC", () => {
    const now = new Date();
    expect(localToday()).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  });
  it("bulk extraction only queues Ready or Error documents; reprocess targets one document", () => {
    const base = { text: "x", fileName: "f.txt", fileType: "txt", confirmed: false };
    const docs: QuoteDocument[] = [
      { ...base, id: "1", status: "Ready" }, { ...base, id: "2", status: "Error" },
      { ...base, id: "3", status: "Needs Review" }, { ...base, id: "4", status: "Extracted", confirmed: true },
    ];
    expect(extractQueue(docs).map((d) => d.id)).toEqual(["1", "2"]);
    expect(extractQueue(docs, "3").map((d) => d.id)).toEqual(["3"]);
  });
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
  it("treats partial logistics as a non-critical warning and keeps the supplier eligible", () => {
    const a = compareDocuments([doc({ freight: 100 })], ref, DEFAULT_WEIGHTS)[0];
    expect(a?.incomplete).toBe(false); expect(a?.eligible).toBe(true);
    expect(a?.anomalies.some((x) => !x.critical && x.message === "Insurance not quoted; landed cost may be understated.")).toBe(true);
  });
  it("blocks eligibility only when no logistics information exists and the Incoterm adder cannot be applied", () => {
    const a = compareDocuments([doc({ incoterm: null })], ref, DEFAULT_WEIGHTS)[0];
    expect(a?.incomplete).toBe(true); expect(a?.eligible).toBe(false);
  });
  it("reports insufficient risk data", () => expect(compareDocuments([doc({ lead_time_days: null })], ref, DEFAULT_WEIGHTS)[0]?.risk).toBe("Insufficient data"));
  it("keeps critical mismatch unawardable", () => {
    const list = compareDocuments([doc({ revision: "B" })], ref, DEFAULT_WEIGHTS);
    expect(list[0]?.eligible).toBe(false); expect(decisionInsights(list, ref).recommended).toBeNull();
  });
  it("does not flag revision differences between peers", () => {
    const list = compareDocuments([doc(), doc({ supplier_name: "B LLC", revision: "B" })], ref, DEFAULT_WEIGHTS);
    expect(list.flatMap((a) => a.anomalies.map((x) => x.message)).some((m) => m.includes("differs from peer"))).toBe(false);
  });
  it("flags only values that differ from the most common peer value, with readable labels", () => {
    const list = compareDocuments([doc(), doc({ supplier_name: "B LLC" }), doc({ supplier_name: "C LLC", currency: "EUR", payment_terms_days: 90 })], ref, DEFAULT_WEIGHTS);
    const c = list.find((a) => a.name === "C LLC");
    expect(c?.anomalies.some((x) => x.message === "Uses EUR while most suppliers quote USD.")).toBe(true);
    expect(c?.anomalies.some((x) => x.message === "Payment terms of 90 days while most suppliers offer 60 days.")).toBe(true);
    expect(list.find((a) => a.name === "Acme LLC")?.anomalies.some((x) => x.message.includes("most suppliers"))).toBe(false);
  });
  it("uses min-max normalisation so the configured cost weight is honoured", () => {
    const list = compareDocuments([doc({ supplier_name: "A LLC", freight: 0, insurance: 0 }), doc({ supplier_name: "B LLC", unit_price: 105, freight: 0, insurance: 0 })], ref, DEFAULT_WEIGHTS);
    expect(list.find((a) => a.name === "A LLC")?.contributions.find((c) => c.key === "cost")?.value).toBe(100);
    expect(list.find((a) => a.name === "B LLC")?.contributions.find((c) => c.key === "cost")?.value).toBe(0);
  });
  it("scores everyone 100 when compared values are equal", () => {
    const list = compareDocuments([doc({ supplier_name: "A LLC" }), doc({ supplier_name: "B LLC" })], ref, DEFAULT_WEIGHTS);
    expect(list.every((a) => a.contributions.find((c) => c.key === "cost")?.value === 100)).toBe(true);
    expect(list.every((a) => a.contributions.find((c) => c.key === "leadTime")?.value === 100)).toBe(true);
  });
  it("scores 0–100 and recommends highest eligible score", () => {
    const list = compareDocuments([doc({ supplier_name: "A LLC", freight: 0, insurance: 0 }), doc({ supplier_name: "B LLC", unit_price: 200, freight: 0, insurance: 0 })], ref, DEFAULT_WEIGHTS);
    expect(list[0]?.score).toBe(100); expect(list[1]?.score).toBe(60); expect(decisionInsights(list, ref).recommended?.name).toBe("A LLC");
  });
  it("does not invent savings without incumbent or target", () => expect(decisionInsights(compareDocuments([doc()], ref, DEFAULT_WEIGHTS), ref).savings).toBeNull());
  it("derives savings from the incumbent quote", () => {
    const r = { ...ref, incumbentSupplier: "B LLC" }; const list = compareDocuments([doc({ supplier_name: "A LLC" }), doc({ supplier_name: "B LLC", unit_price: 200 })], r, DEFAULT_WEIGHTS);
    expect(decisionInsights(list, r).savings).toBe(1248);
  });
  it("matches the incumbent ignoring legal suffixes, case and punctuation", () => {
    const r = { ...ref, incumbentSupplier: "Meridian Flight Components" };
    const list = compareDocuments([doc({ supplier_name: "A LLC" }), doc({ supplier_name: "MERIDIAN FLIGHT COMPONENTS LLC", unit_price: 200 })], r, DEFAULT_WEIGHTS);
    expect(decisionInsights(list, r).baseline).toBe(list[1]?.annualLanded);
    const r2 = { ...ref, incumbentSupplier: "meridian flight components, llc." };
    expect(decisionInsights(list, r2).baseline).toBe(list[1]?.annualLanded);
  });
  it("explains the recommendation and the premium over an ineligible cheaper quote", () => {
    const list = compareDocuments([doc({ supplier_name: "A LLC", unit_price: 110 }), doc({ supplier_name: "B LLC", revision: "B" })], ref, DEFAULT_WEIGHTS);
    const insight = decisionInsights(list, ref);
    expect(insight.recommended?.name).toBe("A LLC");
    expect(insight.why).toContain("B LLC has the lowest annual landed cost but is not awardable");
    expect(insight.why).toContain("Quoted Rev B, requested Rev C.");
    expect(insight.why).toContain("premium of USD 125 per year");
  });
});
describe("Sample dataset expectations (today = 2026-10-25)", () => {
  const sampleRef = { ...ref, requiredDeliveryDate: "2027-03-15", incumbentSupplier: "Meridian Flight Components LLC" };
  const atlas: ExtractedQuote = { ...quote, supplier_name: "ATLAS CONTROLS INC (FICTITIOUS)", quote_id: "Q-77812", quote_date: "2026-09-08", validity_end_date: "2026-11-07", unit_price: 18450, price_breaks: [{ min_qty: 24, unit_price: 17900 }], incoterm: "FCA", lead_time_days: 120, payment_terms_days: 60, moq: 4, surcharge_clause: "Price subject to raw material surcharge if aluminum index rises more than 8%." };
  const helix: ExtractedQuote = { ...quote, supplier_name: "Helix Precision SA (FICTÍCIO)", quote_id: "PC-2026-0915", quote_date: "2026-09-15", validity_end_date: "2026-10-15", unit_price: 16300, currency: "EUR", incoterm: "DAP", lead_time_days: 150, payment_terms_days: 90, fai_included: false, one_time_costs: [{ type: "FAI", amount: 2800, currency: "EUR" }], eccn: null, warranty_months: 18, new_supplier_requires_qualification: true };
  const polar: ExtractedQuote = { ...quote, supplier_name: "POLAR AEROSPACE INC (FICTITIOUS)", quote_id: "PA-55021", quote_date: "2026-09-20", validity_end_date: "2026-11-04", revision: "B", unit_price: 17250, price_breaks: [{ min_qty: 30, unit_price: 16800 }], incoterm: "EXW", lead_time_days: 90, payment_terms_days: 30, one_time_costs: [{ type: "Tooling", amount: 6500, currency: "USD" }], warranty_months: 12 };
  const meridian: ExtractedQuote = { ...quote, supplier_name: "MERIDIAN FLIGHT COMPONENTS LLC (FICTITIOUS)", quote_id: "MFC-1042", quote_date: "2026-10-20", validity_end_date: "2027-01-31", unit_price: 16900, moq: 4, incoterm: "EXW", lead_time_days: 100, payment_terms_days: 60, freight: 24000, insurance: 3000, duties: 0, other_adders: 0, one_time_costs: [{ type: "NRE", amount: 8000, currency: "USD" }], country_of_origin: "USA" };
  const docs: QuoteDocument[] = [atlas, helix, polar, meridian].map((q, i) => ({ id: String(i), text: "", fileName: `q${i}.txt`, fileType: "txt", status: "Extracted", original: q, reviewed: q, confirmed: true }));
  const list = compareDocuments(docs, sampleRef, DEFAULT_WEIGHTS);
  const insight = decisionInsights(list, sampleRef);
  const byName = (n: string) => list.find((a) => a.name === n);
  it("computes the expected annual landed costs in cost order", () => {
    expect(list.map((a) => a.name)).toEqual(["Polar Aerospace INC", "Helix Precision SA", "Atlas Controls INC", "Meridian Flight Components LLC"]);
    expect(byName("Polar Aerospace INC")?.annualLanded).toBe(225920);
    expect(byName("Helix Precision SA")?.annualLanded).toBeCloseTo(228245, 0);
    expect(byName("Atlas Controls INC")?.annualLanded).toBe(230256);
    expect(byName("Meridian Flight Components LLC")?.annualLanded).toBe(237800);
  });
  it("flags Polar and Helix as High risk and not awardable; Atlas Medium and eligible; Meridian eligible", () => {
    expect(byName("Polar Aerospace INC")).toMatchObject({ risk: "High", eligible: false });
    expect(byName("Helix Precision SA")).toMatchObject({ risk: "High", eligible: false });
    expect(byName("Atlas Controls INC")).toMatchObject({ risk: "Medium", eligible: true });
    expect(byName("Meridian Flight Components LLC")?.eligible).toBe(true);
  });
  it("recommends Atlas Controls INC with savings vs the Meridian incumbent", () => {
    expect(insight.recommended?.name).toBe("Atlas Controls INC");
    expect(insight.baselineLabel).toBe("Incumbent quote");
    expect(insight.savings).toBeCloseTo(7544, 0);
    expect(insight.reduction).toBeCloseTo(3.2, 1);
  });
  it("never emits a revision peer-difference message", () => {
    expect(list.flatMap((a) => a.anomalies.map((x) => x.message)).some((m) => m.includes("differs from peer"))).toBe(false);
  });
  it("warns that Helix's 150-day lead time exceeds the required delivery date", () => {
    expect(byName("Helix Precision SA")?.anomalies.some((x) => !x.critical && x.message === "Quoted lead time exceeds the required delivery date.")).toBe(true);
  });
  it("explains why the cheaper Polar quote was not recommended", () => {
    expect(insight.why).toContain("Polar Aerospace INC has the lowest annual landed cost but is not awardable");
    expect(insight.why).toContain("Quoted Rev B, requested Rev C.");
  });
});
