import type { QuoteDocument } from "./workflow";
import type { RfqReference } from "./types";
import type { PoState } from "./po-types";
import type { DocumentRevision } from "./revisions";
import { DEMO_DRAWING } from "./revisions";
import { normalizeSupplierName } from "./supplier-name";

export type SearchKind =
  "RFQ" | "Supplier" | "Quote" | "Part number" | "PO" | "Drawing" | "Revision";
export interface SearchEntry {
  id: string;
  kind: SearchKind;
  label: string;
  detail: string;
  step: number;
}
export interface SearchInput {
  reference: RfqReference;
  documents: QuoteDocument[];
  poState?: PoState | undefined;
  registry?: DocumentRevision[] | undefined;
}

/** Searchable records over the currently loaded RFQ; display labels only, never internal keys. */
export function buildSearchEntries(input: SearchInput): SearchEntry[] {
  const { reference, documents } = input;
  const entries: SearchEntry[] = [];
  if (reference.rfqNumber)
    entries.push({
      id: "rfq",
      kind: "RFQ",
      label: reference.rfqNumber,
      detail: reference.description || "Current RFQ",
      step: 0,
    });
  if (reference.partNumber)
    entries.push({
      id: "part",
      kind: "Part number",
      label: reference.partNumber,
      detail: `Revision ${reference.revision || "not provided"}`,
      step: 0,
    });
  for (const d of documents) {
    const supplier =
      normalizeSupplierName(
        d.reviewed?.supplier_name ?? d.original?.supplier_name ?? "",
        d.text ?? "",
      ).name ?? "";
    if (supplier)
      entries.push({
        id: `supplier-${d.id}`,
        kind: "Supplier",
        label: supplier,
        detail: d.fileName,
        step: d.confirmed ? 3 : 2,
      });
    entries.push({
      id: `quote-${d.id}`,
      kind: "Quote",
      label: d.fileName,
      detail: supplier || "Quotation document",
      step: 1,
    });
  }
  if (input.poState?.po)
    entries.push({
      id: "po",
      kind: "PO",
      label: input.poState.po.poNumber,
      detail: input.poState.po.supplier,
      step: 5,
    });
  entries.push({
    id: "drawing",
    kind: "Drawing",
    label: DEMO_DRAWING,
    detail: "Controlled drawing",
    step: 6,
  });
  for (const r of input.registry ?? [])
    entries.push({
      id: `revision-${r.documentNumber}-${r.revision}`,
      kind: "Revision",
      label: `${r.documentNumber} Rev ${r.revision}`,
      detail: `Effective ${r.effectiveFrom}`,
      step: 6,
    });
  return entries;
}

/** Case-insensitive substring search; empty or whitespace queries return nothing. */
export function globalSearch(
  entries: readonly SearchEntry[],
  query: string,
  limit = 8,
): SearchEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return entries
    .filter(
      (e) => e.label.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}
