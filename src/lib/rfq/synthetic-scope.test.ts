import { describe, expect, it } from "vitest";
import { operationalSummary, requiresAttention, scopeSyntheticEvidence } from "./operations";
import { demoInvestigationCases } from "./investigation-demo";
import { investigateFailure } from "./investigation";
import { newReference } from "./workflow";
import type { QuoteDocument } from "./workflow";
const investigations = demoInvestigationCases().map((c) =>
  investigateFailure(c.failure, c.snapshots, c.registry, c.manufacturedOn),
);
const doc = { id: "u1", fileName: "my-quote.txt", fileType: "txt", status: "Ready", confirmed: false, text: "x" } as unknown as QuoteDocument;
const count = (items: { id: string; count: number }[]) => items.find((i) => i.id === "investigations")?.count;
describe("synthetic demo evidence scope", () => {
  it("a user's own RFQ with one quote does not count demo investigations", () => {
    const input = scopeSyntheticEvidence({ reference: { ...newReference(), today: "2026-11-10" }, documents: [doc], investigations, configurationBlocked: true });
    expect(count(operationalSummary(input))).toBe(0);
    expect(requiresAttention(input).some((i) => i.process === "Investigation")).toBe(false);
    expect(requiresAttention(input).some((i) => i.process === "Configuration")).toBe(false);
  });
  it("a loaded demo sample keeps its synthetic investigations", () => {
    const input = scopeSyntheticEvidence({ reference: { ...newReference(), today: "2026-10-25", demoAnalysis: true }, documents: [doc], investigations });
    expect(count(operationalSummary(input))).toBe(investigations.length);
    expect(investigations.length).toBeGreaterThan(0);
  });
});
