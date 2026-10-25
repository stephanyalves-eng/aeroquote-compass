import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { normalizeSupplierName } from "@/lib/rfq/supplier-name";
import { draftClarificationEmail } from "@/lib/rfq/email";
import type { QuoteAnalysis, RfqReference, RiskLevel, Severity } from "@/lib/rfq/types";
const usd = (n: number | null) => n === null ? "Not provided" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const num = (n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) => n == null ? "Not provided" : n.toLocaleString("en-US", opts);
const inputCls = "w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const riskColor: Record<RiskLevel, string> = { Low: "text-good border-good", Medium: "text-warn border-warn", High: "text-bad border-bad" };
const sevColor: Record<Severity, string> = { HIGH: "text-bad border-bad", MEDIUM: "text-warn border-warn", INFO: "text-muted-foreground border-border" };

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${className}`}><span className="h-2 w-2 rounded-full bg-current" />{children}</span>;
}

function SupplierName({ name, sourceText, fallback = "—" }: { name: string | null; sourceText: string; fallback?: string }) {
  const supplier = normalizeSupplierName(name, sourceText);
  return <span className="inline-flex flex-wrap items-center gap-2">
    <span>{supplier.name ?? fallback}</span>
    {supplier.isFictitious && <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Fictitious</span>}
  </span>;
}

export function ComparisonTable({ ranked, reference, slots }: { ranked: QuoteAnalysis[]; reference: RfqReference; slots: { text: string }[] }) {
  const yn = (b: boolean | null) => (b === null ? "—" : b ? "Yes" : "No");
  const rows: { label: string; mono?: boolean; strong?: boolean; get: (a: QuoteAnalysis) => ReactNode }[] = [
    { label: "Supplier", get: (a) => <SupplierName name={a.quote.supplier_name} sourceText={slots[a.index]?.text ?? ""} /> },
    { label: "Quote id", mono: true, get: (a) => a.quote.quote_id ?? "—" },
    { label: "PN", mono: true, get: (a) => a.quote.part_number ?? "—" },
    { label: "Revision", mono: true, get: (a) => a.quote.revision ?? "—" },
    { label: "Unit price (original)", get: (a) => num(a.applicableUnitPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    { label: "Currency", get: (a) => a.quote.currency ?? "—" },
    { label: "Unit price USD", get: (a) => usd(a.unitPriceUsd) },
    { label: `Annual goods value USD (${reference.annualVolume} u)`, get: (a) => usd(a.annualGoodsUsd) },
    { label: "One-time costs USD", get: (a) => usd(a.oneTimeUsd) },
    { label: "Freight adder USD", get: (a) => `${usd(a.freightUsd)}${a.freightPct !== null ? ` (${a.quote.incoterm} ${a.freightPct}%)` : a.quote.incoterm ? ` (${a.quote.incoterm} n/a)` : ""}` },
    { label: "ANNUAL TOTAL COST USD", strong: true, get: (a) => usd(a.annualTotalUsd) },
    { label: "Lead time (days)", get: (a) => num(a.quote.lead_time_days) },
    { label: "Payment terms (days)", get: (a) => num(a.quote.payment_terms_days) },
    { label: "Validity end date", get: (a) => a.quote.validity_end_date ?? "—" },
    { label: "Certification", get: (a) => (a.quote.certifications.length ? a.quote.certifications.join(", ") : "—") },
    { label: "ECCN", mono: true, get: (a) => a.quote.eccn ?? "—" },
    { label: "Warranty (months)", get: (a) => num(a.quote.warranty_months) },
    { label: "New supplier", get: (a) => yn(a.quote.new_supplier_requires_qualification) },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-petrol text-petrol-foreground">
          <tr>
            <th className="sticky left-0 bg-petrol px-4 py-3 text-left text-xs font-medium uppercase tracking-wide">Field</th>
            {ranked.map((a) => (
              <th key={a.index} className="px-4 py-3 text-right text-xs font-medium">
                #{a.rank} {a.rank === 1 && <span className="ml-1 text-mint">Best</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className={`sticky left-0 bg-background px-4 py-2 text-xs ${r.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{r.label}</td>
              {ranked.map((a) => (
                <td key={a.index} className={`px-4 py-2 text-right ${r.mono ? "font-mono text-xs" : ""} ${r.strong ? "font-semibold" : ""} ${r.strong && a.rank === 1 ? "text-primary" : ""}`}>
                  {r.get(a)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankCard({ a, reference, best, sourceText }: { a: QuoteAnalysis; reference: RfqReference; best: boolean; sourceText: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex flex-col rounded-lg border bg-background p-4 ${best ? "border-primary border-2" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wide ${best ? "text-primary" : "text-muted-foreground"}`}>
            Rank #{a.rank}{best ? " — lowest annual cost" : ""}
          </div>
          <div className="mt-1 font-semibold"><SupplierName name={a.quote.supplier_name} sourceText={sourceText} fallback="Unknown supplier" /></div>
          <div className="font-mono text-xs text-muted-foreground">{a.quote.quote_id ?? "—"}</div>
        </div>
        <Pill className={riskColor[a.risk]}>{a.risk} risk</Pill>
      </div>
      <div className="mt-4 text-2xl font-semibold">{usd(a.annualTotalUsd)}</div>
      <div className="text-xs text-muted-foreground">Annual total cost</div>
      {!a.awardable && <div className="mt-3 rounded-sm border border-bad px-2 py-1 text-xs font-semibold text-bad">Not awardable until resolved</div>}
      <ul className="mt-4 space-y-2">
        {a.alerts.length === 0 && <li className="text-sm text-good">No alerts.</li>}
        {a.alerts.map((al, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Pill className={`${sevColor[al.severity]} shrink-0`}>{al.severity}</Pill>
            <span>{al.message}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex-1" />
      <Button variant="outline" onClick={() => setEmail(draftClarificationEmail(a, reference, sourceText))} className="mt-2 rounded border border-border px-4 py-2 text-sm font-medium hover:border-primary">
        Draft clarification email
      </Button>
      {email !== null && (
        <div className="mt-2">
          <textarea readOnly value={email} rows={12} className={`${inputCls} font-mono text-xs`} />
          <button
            onClick={() => { navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="mt-1 text-xs underline"
          >
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
          <p className="text-xs text-muted-foreground">Draft only. This app never sends emails.</p>
        </div>
      )}
    </div>
  );
}
