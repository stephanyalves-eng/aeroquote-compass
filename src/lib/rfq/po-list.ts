import { lifecycleStatus } from "./po-lifecycle";
import type { PoState, PurchaseOrder } from "./po-types";
export interface PoListRow {
  id: string;
  po: PurchaseOrder;
  rfq: string;
  status: string;
  revision: number;
  updated: string;
  verification: string;
  release: string;
}
export const PO_COLUMNS = [
  "PO number",
  "RFQ",
  "Supplier",
  "Issue date",
  "Amount",
  "Currency",
  "Status",
  "PO revision",
  "Verification",
  "Release",
  "Buyer",
  "Last update",
];
export function poListRows(state: PoState, blocked = false): PoListRow[] {
  const rows: PoListRow[] = (state.lifecycle?.history ?? []).map((v) => ({
    id: `revision-${v.revision}`,
    po: v.po,
    rfq: v.po.rfqReference,
    status: v.status,
    revision: v.revision,
    updated: v.timestamp,
    verification: "Historical snapshot",
    release: "Superseded",
  }));
  if (state.po)
    rows.push({
      id: "current",
      po: state.po,
      rfq: state.po.rfqReference,
      status: lifecycleStatus(state, blocked),
      revision: state.lifecycle?.revision ?? 1,
      updated: state.lifecycle?.updatedAt ?? state.po.issueDate,
      verification: state.result
        ? blocked
          ? "Configuration blocked"
          : lifecycleStatus(state, blocked)
        : "Not yet recorded",
      release: lifecycleStatus(state, blocked) === "Released" ? "Released" : "Not released",
    });
  return rows;
}
export interface PoListFilter {
  search: string;
  status: string;
  supplier: string;
  rfq?: string;
  buyer: string;
  currency: string;
  from: string;
  to: string;
  sort: "updated" | "number" | "amount";
}
export function filterPoList(rows: PoListRow[], f: PoListFilter): PoListRow[] {
  return rows
    .filter(
      (r) =>
        (!f.search ||
          [r.po.poNumber, r.rfq, r.po.supplier, r.po.buyer]
            .join(" ")
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (!f.status || r.status === f.status) &&
        (!f.supplier || r.po.supplier === f.supplier) &&
        (!f.rfq || r.rfq === f.rfq) &&
        (!f.buyer || r.po.buyer === f.buyer) &&
        (!f.currency || r.po.currency === f.currency) &&
        (!f.from || r.po.issueDate >= f.from) &&
        (!f.to || r.po.issueDate <= f.to),
    )
    .sort((a, b) =>
      f.sort === "number"
        ? a.po.poNumber.localeCompare(b.po.poNumber)
        : f.sort === "amount"
          ? (b.po.totalValue ?? -Infinity) - (a.po.totalValue ?? -Infinity)
          : b.updated.localeCompare(a.updated),
    );
}
export function poListCells(r: PoListRow): string[] {
  return [
    r.po.poNumber,
    r.rfq,
    r.po.supplier,
    r.po.issueDate,
    r.po.totalValue == null
      ? "Not provided"
      : r.po.totalValue.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
    r.po.currency ?? "Not provided",
    r.status,
    String(r.revision),
    r.verification,
    r.release,
    r.po.buyer,
    r.updated,
  ];
}
export function poListCsv(rows: PoListRow[]): string {
  return [PO_COLUMNS, ...rows.map(poListCells)]
    .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
