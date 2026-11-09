import type { AuditEvent } from "./review-types";
import { REVIEW_FIELDS } from "./workflow";
import { CRITERIA, type Weights } from "./intelligence";
import { PO_TOLERANCE_FIELDS } from "./po-check";

/** Human-readable value: never exposes internal field keys or raw JSON. */
export function humanValue(v: unknown): string {
  if (v == null || v === "") return "Not provided";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "Not provided";
  if (Array.isArray(v)) return v.length ? v.map((x) => typeof x === "object" && x ? Object.values(x).filter((y) => y != null).join(" ") : humanValue(x)).join("; ") : "None";
  if (typeof v === "object") return "Structured record";
  return String(v);
}
const fieldLabel = (k?: string) => REVIEW_FIELDS.find((f) => f.key === k)?.label ?? (k ? "Quotation field" : "");
const weightsText = (w: unknown) => w && typeof w === "object" ? Object.entries(w as Weights).map(([k, v]) => `${CRITERIA[k as keyof Weights] ?? "Criterion"} ${v}%`).join(", ") : "";
const tolText = (t: unknown) => t && typeof t === "object" ? Object.entries(t as Record<string, number>).map(([k, v]) => `${PO_TOLERANCE_FIELDS.find((f) => f.key === k)?.label ?? "Tolerance"} ${v}`).join(", ") : "";
/** One readable sentence per audit event for the timeline and exports. */
export function describeAudit(e: AuditEvent): string {
  const d = (e.details ?? {}) as Record<string, unknown>, parts: string[] = [];
  if (e.field) parts.push(fieldLabel(e.field));
  if (e.previousValue !== undefined || (e.newValue !== undefined && e.field)) parts.push(`${humanValue(e.previousValue)} → ${humanValue(e.newValue)}`);
  if (d["fileName"]) parts.push(`File ${String(d["fileName"])}`);
  if (d["source"]) parts.push(String(d["source"]));
  if (d["analysisDate"]) parts.push(`Analysis date ${String(d["analysisDate"])}`);
  const conf = d["confidences"] as Record<string, number | null> | undefined;
  if (conf && typeof conf === "object") { const v = Object.entries(conf).filter(([, n]) => n != null); parts.push(v.length ? `AI confidence: ${v.map(([k, n]) => `${fieldLabel(k)} ${n}%`).join(", ")}` : "AI confidence not provided"); }
  if (d["weights"]) parts.push(`Weights: ${weightsText(d["weights"])}`);
  if (d["previousWeights"]) parts.push(`Previous weights: ${weightsText(d["previousWeights"])}`);
  if (d["formula"]) parts.push(`Formula: ${String(d["formula"])}`);
  if (d["assumptions"]) parts.push(`Assumptions: ${(d["assumptions"] as string[]).join("; ")}`);
  if (typeof d["total"] === "number") parts.push(`Annual landed USD ${Math.round(d["total"] as number).toLocaleString("en-US")}`);
  if (Array.isArray(d["factors"])) parts.push(`Factors: ${(d["factors"] as string[]).join("; ")}`);
  if (d["robustness"]) parts.push(`Robustness ${String(d["robustness"])}`);
  const counts = d["counts"] as Record<string, number> | undefined;
  if (counts) parts.push(`Confirmed ${counts["confirmed"] ?? 0}, discrepancies ${counts["discrepancies"] ?? 0}, blockers ${counts["blockers"] ?? 0}`);
  if (d["tolerances"]) parts.push(`Tolerances: ${tolText(d["tolerances"])}`);
  for (const [k, label] of [["check", "Check"], ["poNumber", "PO"], ["supplier", "Supplier"], ["status", "Status"], ["reason", "Reason"], ["document", "Document"], ["revision", "Revision"], ["effectiveFrom", "Effective"], ["level", "Impact"], ["classification", "Classification"], ["count", "Fields"]] as const)
    if (d[k] != null && typeof d[k] !== "object") parts.push(`${label} ${String(d[k])}`);
  if (e.action === "Final decision" && e.newValue && typeof e.newValue === "object") { const x = e.newValue as Record<string, unknown>; parts.push(`Supplier ${String(x["supplier"])}; recommended ${String(x["recommendedSupplier"])}; ${x["override"] ? "override" : "follows recommendation"}`); }
  if (e.justification) parts.push(`Justification: ${e.justification}`);
  return parts.filter(Boolean).join(" · ") || "—";
}
