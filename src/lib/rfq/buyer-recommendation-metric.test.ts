import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "./intelligence";
import { sampleDocuments, sampleReference } from "./phase2-fixtures";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import {
  RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT,
  shouldMeasureBuyerConfirmedRecommendation as measure,
} from "./recommendation";
import { RFQ_CONFIRMED_RECOMMENDATION_EVENT } from "./po-confirmation";
const audit = (action: string) => [
  { id: "milestone", action, timestamp: "2026-10-25T12:00:00Z", actor: "Demo buyer" },
];
describe("Weekly recommendations after buyer quotation confirmation", () => {
  it("does not count initial or partially confirmed quotations", () => {
    expect(measure([], sampleReference, DEFAULT_WEIGHTS, [])).toBe(false);
    expect(
      measure(
        sampleDocuments.map((d) => ({ ...d, confirmed: false })),
        sampleReference,
        DEFAULT_WEIGHTS,
        [],
      ),
    ).toBe(false);
    expect(
      measure(
        sampleDocuments.map((d, i) => ({ ...d, confirmed: i !== 3 })),
        sampleReference,
        DEFAULT_WEIGHTS,
        [],
      ),
    ).toBe(false);
  });
  it("counts a recommendation from the fully confirmed classic comparison", () => {
    expect(measure(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, [])).toBe(true);
  });
  it("requires a genuinely eligible supplier", () => {
    const docs = sampleDocuments.map((d) => ({
      ...d,
      reviewed: d.reviewed ? { ...d.reviewed, revision: "WRONG" } : undefined,
    }));
    expect(measure(docs, sampleReference, DEFAULT_WEIGHTS, [])).toBe(false);
  });
  it("requires valid RFQ inputs and scoring weights", () => {
    expect(
      measure(sampleDocuments, { ...sampleReference, annualVolume: 0 }, DEFAULT_WEIGHTS, []),
    ).toBe(false);
    expect(measure(sampleDocuments, sampleReference, { ...DEFAULT_WEIGHTS, cost: 0 }, [])).toBe(
      false,
    );
  });
  it("demo buyer validation counts while held quotations remain outside comparison", () => {
    const ref = { ...sampleReference, partNumber: "PN-45Y1258", demoAnalysis: true };
    const docs = extendedSampleDocuments();
    expect(measure(docs, ref, DEFAULT_WEIGHTS, [])).toBe(false);
    expect(measure(confirmValidatedSamples(docs), ref, DEFAULT_WEIGHTS, [])).toBe(true);
  });
  it("never recounts reconfirmation or a saved and reopened RFQ audit", () => {
    const milestone = audit(RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT);
    expect(measure(sampleDocuments, sampleReference, DEFAULT_WEIGHTS, milestone)).toBe(false);
    expect(
      measure(
        JSON.parse(JSON.stringify(sampleDocuments)),
        sampleReference,
        DEFAULT_WEIGHTS,
        JSON.parse(JSON.stringify(milestone)),
      ),
    ).toBe(false);
  });
  it("is distinct from the later supplier acknowledgement metric", () => {
    expect(
      measure(
        sampleDocuments,
        sampleReference,
        DEFAULT_WEIGHTS,
        audit(RFQ_CONFIRMED_RECOMMENDATION_EVENT),
      ),
    ).toBe(true);
  });
});
