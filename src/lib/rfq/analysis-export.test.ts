import { describe, it, expect } from "vitest";
import { extendedSampleDocuments, confirmValidatedSamples } from "./sample-catalog";
import { compareDocuments, DEFAULT_WEIGHTS } from "./intelligence";
import { newReference } from "./workflow";
import { analysisChartPage, analysisPdfTables, analysisSheets, csvText } from "./exports";

const ref = { ...newReference(), today: "2026-10-25", demoAnalysis: true, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, requiredDeliveryDate: "2027-03-15", incumbentSupplier: "Meridian Flight Components LLC" };
const all = confirmValidatedSamples(extendedSampleDocuments());
const sets = { classic: all.slice(0, 4), extended: all };
// snake_case, camelCase, raw JSON, or developer artefacts
const KEY = /\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][a-zA-Z]+\b|[{}]|\bundefined\b|\bNaN\b|\[object Object\]|Structured record/;
const leaks = (where: string, cells: unknown[]) => cells.filter((c) => typeof c === "string" || typeof c === "boolean").map(String).filter((c) => KEY.test(c) || c === "true" || c === "false").map((c) => `${where}: ${c}`);

describe("original analysis export never leaks internal field names", () => {
  for (const [label, docs] of Object.entries(sets)) {
    const list = compareDocuments(docs, ref, DEFAULT_WEIGHTS);
    it(`${label}: every Excel sheet (names, headers and cells)`, () => {
      const sheets = analysisSheets(list, ref, DEFAULT_WEIGHTS);
      expect(Object.keys(sheets)).toEqual(["RFQ Data", "Supplier Data", "Normalized Cost Data", "Scoring", "Risk Assessment", "Recommendation", "Decision Explanation", "Landed Cost Breakdown"]);
      const found = Object.entries(sheets).flatMap(([name, rows]) => [...leaks(`${name} sheet name`, [name]), ...rows.flatMap((r) => [...leaks(`${name} header`, Object.keys(r)), ...leaks(name, Object.values(r))])]);
      expect(found).toEqual([]);
      for (const rows of Object.values(sheets)) expect(rows.length).toBeGreaterThan(0);
    });
    it(`${label}: every PDF table (titles, headers and cells)`, () => {
      const tables = analysisPdfTables(list, ref, DEFAULT_WEIGHTS);
      expect(tables.length).toBe(6 + list.length);
      expect(tables.flatMap((t) => leaks(t.title, [t.title, ...t.head, ...t.rows.flat()]))).toEqual([]);
      expect(tables.flatMap((t) => t.rows.flat()).some((c) => /[÷×−≥]/.test(c))).toBe(false);
    });
    it(`${label}: every text label on the PDF bar-chart page`, () => {
      const chart = analysisChartPage(list, ref);
      expect(chart.bars).toHaveLength(list.length);
      expect(chart.labels.length).toBe(3 + 2 * list.length);
      expect(leaks("Chart page", chart.labels)).toEqual([]);
      expect(chart.labels.some((c) => /[÷×−≥]/.test(c))).toBe(false);
      for (const b of chart.bars) expect(b.value).toMatch(/^(\d{1,3}(,\d{3})*|Not provided)$/);
      expect(chart.bars.filter((b) => b.recommended)).toHaveLength(1);
    });
    it(`${label}: CSV`, () => expect(leaks("CSV", csvText(list, ref, DEFAULT_WEIGHTS).split(/\r\n/).flatMap((l) => l.split('","')))).toEqual([]));
  }
  it("chart labels never show raw supplier keys or missing values as undefined", () => {
    const list = compareDocuments(sets.classic, ref, DEFAULT_WEIGHTS);
    const broken = list.map((a, i) => (i === 0 ? { ...a, annualLanded: null } : a));
    const chart = analysisChartPage(broken as typeof list, ref);
    expect(chart.bars[0]!.value).toBe("Not provided");
    expect(leaks("Chart page", chart.labels)).toEqual([]);
  });
  it("yes/no flags are words, numbers stay numeric", () => {
    const rows = analysisSheets(compareDocuments(sets.classic, ref, DEFAULT_WEIGHTS), ref, DEFAULT_WEIGHTS)["Normalized Cost Data"] as Record<string, unknown>[];
    expect(rows[0]!["Awardable"]).toMatch(/^(Yes|No)$/);
    expect(typeof rows[0]!["Annual landed cost USD"]).toBe("number");
  });
});
