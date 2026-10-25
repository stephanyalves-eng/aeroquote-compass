import type { ReactNode } from "react";
import { normalizeSupplierName } from "@/lib/rfq/supplier-name";
export const control = "w-full min-w-0 rounded-sm border border-border-default bg-surface-card px-3 py-2 text-sm outline-none";
export function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="space-y-5 rounded-lg border border-border-default bg-surface-card p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-medium">{title}</h2>{subtitle && <p className="mt-1 text-sm text-text-tertiary">{subtitle}</p>}</div>{action}</div>{children}</section>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 space-y-1.5"><span className="text-xs font-medium text-text-tertiary">{label}</span>{children}</label>; }
export function Money({ value }: { value: number | null | undefined }) { return <>{value == null ? "Not provided" : "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</>; }
export function Supplier({ name, source = "" }: { name: string | null; source?: string }) {
  const n = normalizeSupplierName(name, source);
  return <span className="inline-flex flex-wrap items-center gap-2"><span>{n.name ?? "Not provided"}</span>{n.isFictitious && <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-xs font-normal text-text-tertiary">Fictitious</span>}</span>;
}
export function Status({ children }: { children: ReactNode }) { return <span className="inline-flex rounded-sm border border-border-default bg-surface-sunken px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{children}</span>; }
