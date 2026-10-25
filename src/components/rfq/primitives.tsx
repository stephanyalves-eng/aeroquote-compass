import type { ReactNode } from "react";
import { normalizeSupplierName } from "@/lib/rfq/supplier-name";
export const control = "w-full min-w-0 rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
export function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="space-y-5 border-b border-border pb-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>{action}</div>{children}</section>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>; }
export function Money({ value }: { value: number | null | undefined }) { return <>{value == null ? "Not provided" : "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</>; }
export function Supplier({ name, source = "" }: { name: string | null; source?: string }) {
  const n = normalizeSupplierName(name, source);
  return <span className="inline-flex flex-wrap items-center gap-2"><span>{n.name ?? "Not provided"}</span>{n.isFictitious && <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Fictitious</span>}</span>;
}
export function Status({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-sm border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{children}</span>; }