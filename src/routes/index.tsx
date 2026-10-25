import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { extractQuote } from "@/lib/rfq/extract.functions";
import { analyzeQuote, DEFAULT_INCOTERM_ADDERS, rankQuotes } from "@/lib/rfq/rules";
import { SAMPLE_QUOTES } from "@/lib/rfq/samples";
import { draftClarificationEmail } from "@/lib/rfq/email";
import type { ExtractedQuote, QuoteAnalysis, RfqReference, RiskLevel, Severity } from "@/lib/rfq/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RFQ Quote Analyzer — Compare supplier quotes" },
      { name: "description", content: "Compare aerospace supplier quotes on total annual cost and risk. AI extracts, code calculates, you decide." },
      { property: "og:title", content: "RFQ Quote Analyzer" },
      { property: "og:description", content: "Compare aerospace supplier quotes on total annual cost and risk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface QuoteSlot {
  text: string;
  pdfBase64?: string;
  fileName?: string;
  status: "idle" | "loading" | "done" | "error";
  error?: string;
  extracted?: ExtractedQuote;
}

const emptySlot = (): QuoteSlot => ({ text: "", status: "idle" });
const MAX = 5;

const usd = (n: number | null) => (n === null ? "—" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const num = (n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", opts);

function Index() {
  const [ref, setRef] = useState<RfqReference>({
    rfqNumber: "",
    partNumber: "",
    revision: "",
    annualVolume: 12,
    requiredCertification: "AS9100D",
    usdBrl: 5.1447,
    eurBrl: 5.9186,
    incotermAdders: { ...DEFAULT_INCOTERM_ADDERS },
    today: "",
  });
  useEffect(() => setRef((r) => ({ ...r, today: r.today || new Date().toISOString().slice(0, 10) })), []);
  const [slots, setSlots] = useState<QuoteSlot[]>([emptySlot(), emptySlot()]);
  const [busy, setBusy] = useState(false);
  const extract = useServerFn(extractQuote);

  const updateSlot = (i: number, patch: Partial<QuoteSlot>) =>
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const loadSamples = () => {
    setRef((r) => ({ ...r, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12 }));
    setSlots(SAMPLE_QUOTES.map((text) => ({ text, status: "idle" })));
  };

  const analyze = async () => {
    setBusy(true);
    const today = ref.today;
    await Promise.all(
      slots.map(async (s, i) => {
        if (!s.text.trim() && !s.pdfBase64) return;
        updateSlot(i, { status: "loading", error: undefined });
        try {
          const r = await extract({ data: { text: s.text, pdfBase64: s.pdfBase64, today } });
          if (r.error || !r.quote) updateSlot(i, { status: "error", error: r.error ?? "Extraction failed." });
          else updateSlot(i, { status: "done", extracted: r.quote });
        } catch (e) {
          updateSlot(i, { status: "error", error: e instanceof Error ? e.message : "Extraction failed." });
        }
      }),
    );
    setBusy(false);
  };

  const ranked = useMemo(() => {
    const list = slots
      .map((s, i) => (s.status === "done" && s.extracted ? analyzeQuote(s.extracted, ref, i) : null))
      .filter((x): x is QuoteAnalysis => x !== null);
    return rankQuotes(list);
  }, [slots, ref]);

  const hasInput = slots.some((s) => s.text.trim() || s.pdfBase64);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-petrol text-petrol-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-6 sm:px-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-mint font-mono text-sm font-medium text-mint">
            SA
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">RFQ Quote Analyzer</h1>
            <p className="text-sm opacity-80">Compare supplier quotes on total annual cost and risk</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-8">
        <Section title="RFQ reference">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="RFQ number"><Input mono value={ref.rfqNumber} onChange={(v) => setRef({ ...ref, rfqNumber: v })} placeholder="RFQ-00000" /></Field>
            <Field label="Requested part number"><Input mono value={ref.partNumber} onChange={(v) => setRef({ ...ref, partNumber: v })} placeholder="PN-..." /></Field>
            <Field label="Requested revision"><Input mono value={ref.revision} onChange={(v) => setRef({ ...ref, revision: v })} placeholder="C" /></Field>
            <Field label="Annual volume (units)"><NumInput value={ref.annualVolume} onChange={(v) => setRef({ ...ref, annualVolume: v })} /></Field>
            <Field label="Required certification"><Input value={ref.requiredCertification} onChange={(v) => setRef({ ...ref, requiredCertification: v })} /></Field>
            <Field label="USD/BRL"><NumInput step="0.0001" value={ref.usdBrl} onChange={(v) => setRef({ ...ref, usdBrl: v })} /></Field>
            <Field label="EUR/BRL"><NumInput step="0.0001" value={ref.eurBrl} onChange={(v) => setRef({ ...ref, eurBrl: v })} /></Field>
            <Field label="Today's date"><Input type="date" value={ref.today} onChange={(v) => setRef({ ...ref, today: v })} /></Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            EUR to USD = {ref.eurBrl} / {ref.usdBrl} = {(ref.eurBrl / ref.usdBrl).toFixed(4)}
          </p>
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Freight and insurance adder (% of goods value)</div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {Object.keys(ref.incotermAdders).map((k) => (
                <Field key={k} label={k}>
                  <NumInput step="0.1" value={ref.incotermAdders[k]} onChange={(v) => setRef({ ...ref, incotermAdders: { ...ref.incotermAdders, [k]: v } })} />
                </Field>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="Supplier quotes"
          action={
            <button onClick={loadSamples} className="rounded border border-border bg-background px-4 py-2 text-sm font-medium hover:border-primary">
              Load sample quotes
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {slots.map((s, i) => (
              <QuoteCard
                key={i}
                index={i}
                slot={s}
                onChange={(p) => updateSlot(i, { ...p, status: "idle", extracted: undefined })}
                onRemove={slots.length > 1 ? () => setSlots(slots.filter((_, j) => j !== i)) : undefined}
              />
            ))}
            {slots.length < MAX && (
              <button
                onClick={() => setSlots([...slots, emptySlot()])}
                className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground"
              >
                + Add quote ({slots.length}/{MAX})
              </button>
            )}
          </div>
          <div className="mt-6">
            <button
              onClick={analyze}
              disabled={busy || !hasInput}
              className="w-full rounded bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 sm:w-auto"
            >
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </Section>

        {ranked.length > 0 && (
          <>
            <Section title="Comparison">
              <ComparisonTable ranked={ranked} reference={ref} />
            </Section>
            <Section title="Ranking by annual total cost">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {ranked.map((a) => (
                  <RankCard key={a.index} a={a} reference={ref} best={a.rank === 1} />
                ))}
              </div>
            </Section>
          </>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl space-y-1 px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <p className="font-medium text-foreground">AI extracts. Code calculates. You decide.</p>
          <p>Synthetic sample data for portfolio purposes. No real company data. Built by Stephany Alves.</p>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Input({ value, onChange, mono, type = "text", placeholder }: { value: string; onChange: (v: string) => void; mono?: boolean; type?: string; placeholder?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${mono ? "font-mono" : ""}`} />;
}

function NumInput({ value, onChange, step = "1" }: { value: number; onChange: (v: number) => void; step?: string }) {
  return <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(parseFloat(e.target.value))} className={inputCls} />;
}

function QuoteCard({ index, slot, onChange, onRemove }: { index: number; slot: QuoteSlot; onChange: (p: Partial<QuoteSlot>) => void; onRemove?: () => void }) {
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      reader.onload = () => onChange({ pdfBase64: String(reader.result).split(",")[1], fileName: f.name });
      reader.readAsDataURL(f);
    } else {
      reader.onload = () => onChange({ text: String(reader.result), pdfBase64: undefined, fileName: f.name });
      reader.readAsText(f);
    }
  };
  return (
    <div className="flex flex-col rounded-lg border border-border bg-background p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Quote {index + 1}</span>
        <StatusText slot={slot} />
      </div>
      <textarea
        value={slot.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Paste the supplier quotation text…"
        rows={9}
        className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="cursor-pointer rounded border border-border px-2 py-1 hover:border-primary">
          Upload .txt / .pdf
          <input type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {slot.fileName && (
          <span className="truncate text-muted-foreground">
            {slot.fileName}
            {slot.pdfBase64 && (
              <button className="ml-2 underline" onClick={() => onChange({ pdfBase64: undefined, fileName: undefined })}>remove</button>
            )}
          </span>
        )}
        {onRemove && <button onClick={onRemove} className="text-muted-foreground underline">Remove card</button>}
      </div>
      {slot.status === "error" && <p className="mt-2 text-xs text-bad">Error: {slot.error}</p>}
    </div>
  );
}

function StatusText({ slot }: { slot: QuoteSlot }) {
  if (slot.status === "loading") return <span className="text-xs text-muted-foreground">Extracting…</span>;
  if (slot.status === "done") return <span className="text-xs text-good">Extracted</span>;
  if (slot.status === "error") return <span className="text-xs text-bad">Failed</span>;
  return null;
}

const riskColor: Record<RiskLevel, string> = { Low: "text-good border-good", Medium: "text-warn border-warn", High: "text-bad border-bad" };
const sevColor: Record<Severity, string> = { HIGH: "text-bad border-bad", MEDIUM: "text-warn border-warn", INFO: "text-muted-foreground border-border" };

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${className}`}><span className="h-2 w-2 rounded-full bg-current" />{children}</span>;
}

function ComparisonTable({ ranked, reference }: { ranked: QuoteAnalysis[]; reference: RfqReference }) {
  const yn = (b: boolean | null) => (b === null ? "—" : b ? "Yes" : "No");
  const rows: { label: string; mono?: boolean; strong?: boolean; get: (a: QuoteAnalysis) => ReactNode }[] = [
    { label: "Supplier", get: (a) => a.quote.supplier_name ?? "—" },
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

function RankCard({ a, reference, best }: { a: QuoteAnalysis; reference: RfqReference; best: boolean }) {
  const [email, setEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex flex-col rounded-lg border bg-background p-4 ${best ? "border-primary border-2" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wide ${best ? "text-primary" : "text-muted-foreground"}`}>
            Rank #{a.rank}{best ? " — lowest annual cost" : ""}
          </div>
          <div className="mt-1 font-semibold">{a.quote.supplier_name ?? "Unknown supplier"}</div>
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
      <button onClick={() => setEmail(draftClarificationEmail(a, reference))} className="mt-2 rounded border border-border px-4 py-2 text-sm font-medium hover:border-primary">
        Draft clarification email
      </button>
      {email !== null && (
        <div className="mt-2">
          <textarea readOnly value={email} rows={12} className={`${inputCls} font-mono text-xs`} />
          <button
            onClick={() => { navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="mt-1 text-xs underline"
          >
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
          <p className="text-xs text-muted-foreground">Draft only. This app never sends emails.</p>
        </div>
      )}
    </div>
  );
}
