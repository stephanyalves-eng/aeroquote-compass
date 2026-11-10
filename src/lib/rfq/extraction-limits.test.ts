import { describe, expect, it } from "vitest";
import { extractionInput, EXTRACTION_LIMITS } from "./extraction-limits";

const base = { today: "2026-11-10", fileName: "quote.txt" };

describe("AI extraction request bounds", () => {
  it("accepts 60,000 text characters and rejects 60,001", () => {
    expect(extractionInput.safeParse({ ...base, text: "x".repeat(60_000) }).success).toBe(true);
    expect(extractionInput.safeParse({ ...base, text: "x".repeat(60_001) }).success).toBe(false);
  });
  it("accepts at most 8,000,000 base64 PDF characters", () => {
    const pdfBase64 = "JVBERi0" + "A".repeat(7_999_993);
    expect(extractionInput.safeParse({ ...base, pdfBase64 }).success).toBe(true);
    expect(extractionInput.safeParse({ ...base, pdfBase64: pdfBase64 + "AAAA" }).success).toBe(false);
  });
  it("rejects empty documents", () => {
    expect(extractionInput.safeParse({ ...base, text: "  " }).success).toBe(false);
  });
  it("rejects two paid input modalities in one request", () => {
    expect(extractionInput.safeParse({ ...base, text: "quote", pdfBase64: "JVBERi0x" }).success).toBe(false);
  });
  it("rejects non-PDF and malformed base64", () => {
    for (const pdfBase64 of ["aGVsbG8=", "JVBERi0!", "JVBERi0", "JVBERi0x==="]) {
      expect(extractionInput.safeParse({ ...base, pdfBase64 }).success).toBe(false);
    }
  });
  it("rejects invalid calendar dates", () => {
    expect(extractionInput.safeParse({ ...base, text: "quote", today: "2026-02-30" }).success).toBe(false);
  });
  it("rejects client-selected models or output budgets", () => {
    expect(extractionInput.safeParse({ ...base, text: "quote", model: "other" }).success).toBe(false);
    expect(extractionInput.safeParse({ ...base, text: "quote", maxOutputTokens: 100_000 }).success).toBe(false);
  });
  it("caps total reasoning and output at 8,000 tokens", () => {
    expect(EXTRACTION_LIMITS.outputTokens).toBe(8_000);
  });
});