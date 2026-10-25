import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowRight, ArrowLeft, Save, History as HistoryIcon, Plus, Check } from "lucide-react";
import { SaMonogram } from "@/assets/sa-monogram";
import { Button } from "@/components/ui/button";
import { extractQuote } from "@/lib/rfq/extract.functions";
import { saveHistory } from "@/lib/rfq/history.functions";
import { SAMPLE_QUOTES } from "@/lib/rfq/samples";
import { newReference, referenceErrors, canCompare, quoteErrors, MAX_FILES, localToday, extractQueue, type QuoteDocument, type RfqStatus } from "@/lib/rfq/workflow";
import { readQuoteFile } from "@/lib/rfq/files";
import { compareDocuments, decisionInsights, DEFAULT_WEIGHTS } from "@/lib/rfq/intelligence";
import { Setup } from "@/components/rfq/setup";
import { Uploads } from "@/components/rfq/uploads";
import { Review } from "@/components/rfq/review";
import { Dashboard } from "@/components/rfq/dashboard";
import { History, type Snapshot } from "@/components/rfq/history";
import { Status, control } from "@/components/rfq/primitives";
import type { ExtractedQuote } from "@/lib/rfq/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "AeroQuote Compass — Strategic Procurement Intelligence" },
    { name: "description", content: "Review supplier quotations, compare annual landed costs and make transparent, data-driven aerospace sourcing decisions." },
    { property: "og:title", content: "AeroQuote Compass — Supplier Quotation Intelligence" },
    { property: "og:description", content: "AI extracts. Buyers validate. Deterministic cost and supplier scoring support your procurement decision." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});
const steps = ["RFQ Setup", "Upload Quotes", "Review Data", "Compare & Decide"];
function Index() {
  const [reference, setReference] = useState(newReference);
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [step, setStep] = useState(0); const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false); const processing = useRef(false);
  const [notice, setNotice] = useState(""); const [status, setStatus] = useState<RfqStatus>("Draft");
  const [savedId, setSavedId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const extract = useServerFn(extractQuote); const save = useServerFn(saveHistory);
  useEffect(() => setReference((r) => ({ ...r, today: r.today || localToday() })), []);
  const validReference = referenceErrors(reference).length === 0;
  const ready = canCompare(documents, reference);
  const results = useMemo(() => ready ? compareDocuments(documents, reference, weights) : [], [documents, reference, weights, ready]);
  const patch = (id: string, update: Partial<QuoteDocument>) => setDocuments((ds) => ds.map((d) => d.id === id ? { ...d, ...update } : d));
  const edit = (id: string, q: ExtractedQuote) => { patch(id, { reviewed: q, confirmed: false, status: "Needs Review" }); setStatus("Draft"); };
  const loadSamples = () => {
    setReference((r) => ({ ...r, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, description: "Hydraulic actuator Y8", category: "Hydraulic systems", requiredDeliveryDate: "2027-03-15", deliveryLocation: "São José dos Campos", incumbentSupplier: "Meridian Flight Components LLC", targetCost: null }));
    setDocuments(SAMPLE_QUOTES.map((text, i) => ({ id: crypto.randomUUID(), text, fileName: ["atlas-quote.txt", "helix-quote.txt", "polar-quote.txt", "meridian-quote.txt"][i] ?? `sample-${i}.txt`, fileType: "txt", status: "Ready", confirmed: false })));
    setStep(1); setHistory(false); setStatus("Draft"); setSavedId(undefined); setNotice("");
  };
  const files = async (incoming: File[]) => {
    if (processing.current || documents.some((d) => d.status === "Uploading")) return;
    const capacity = MAX_FILES - documents.length;
    if (incoming.length > capacity) { setNotice(`A maximum of ${MAX_FILES} files is allowed per RFQ. No files added.`); return; }
    const added: QuoteDocument[] = incoming.map((f) => ({ id: crypto.randomUUID(), text: "", fileName: f.name, fileType: f.name.split(".").pop()?.toLowerCase() ?? "", status: "Uploading", confirmed: false }));
    setDocuments((ds) => [...ds, ...added]); setNotice(""); setStatus("Draft");
    await Promise.all(incoming.map(async (f, i) => { const d = added[i]; if (!d) return; try { const content = await readQuoteFile(f); patch(d.id, { ...content, status: "Ready" }); } catch (e) { patch(d.id, { status: "Error", error: e instanceof Error ? e.message : "Corrupted file." }); } }));
  };
  const process = async (id?: string) => {
    if (processing.current) return;
    if (!validReference) { setNotice(referenceErrors(reference).join(" ")); setStep(0); return; }
    if (id) {
      const target = documents.find((d) => d.id === id);
      if (target?.original && target.reviewed && JSON.stringify(target.original) !== JSON.stringify(target.reviewed)
        && !window.confirm("Reprocessing will overwrite the buyer's manual edits for this quotation. Continue?")) return;
    }
    processing.current = true; setBusy(true); setStatus("Analyzing"); setNotice("");
    const queue = extractQueue(documents, id);
    let failed = false;
    try {
      // Sequential requests avoid overwhelming the shared AI rate limit.
      for (const d of queue) {
        patch(d.id, { status: "Processing", confirmed: false, error: undefined });
        try {
          const r = await extract({ data: { text: d.text, pdfBase64: d.pdfBase64, today: reference.today, fileName: d.fileName } });
          if (!r.quote || r.error) { patch(d.id, { status: "Error", error: r.error ?? "Extraction failed." }); failed = true; if (/credits|blocked|configured/i.test(r.error ?? "")) break; }
          else patch(d.id, { original: structuredClone(r.quote), reviewed: structuredClone(r.quote), status: "Needs Review", confirmed: false,
            // PDFs have no raw text; keep a short source text so fictitious-marker detection still works.
            text: d.text.trim() ? d.text : [r.quote.supplier_name, r.quote.notes].filter(Boolean).join(" — ") });
        } catch { patch(d.id, { status: "Error", error: "Extraction failed. Reprocess this quotation." }); failed = true; }
      }
      if (failed) setNotice("Some quotations could not be extracted. Resolve or remove failed files before comparison.");
      setStep(2); setStatus("Draft");
    } finally { processing.current = false; setBusy(false); }
  };
  const saveCurrent = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setNotice("Sign in to save this analysis privately."); setHistory(true); return; }
    if (!reference.rfqNumber || !reference.partNumber) { setNotice("RFQ number and part number are required to save."); return; }
    setSaving(true);
    try {
      const insight = decisionInsights(results, reference);
      const snapshot: Snapshot = { reference, documents, weights, summary: { supplier: insight.recommended?.name ?? null, landed: insight.recommended?.annualLanded ?? null, savings: insight.savings } };
      const result = await save({ data: { ...(savedId ? { id: savedId } : {}), rfqNumber: reference.rfqNumber, partNumber: reference.partNumber, status, snapshot: JSON.stringify(snapshot) } });
      setSavedId(result.id); setNotice("RFQ analysis saved privately.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save this analysis."); } finally { setSaving(false); }
  };
  const open = (id: string, snapshot: Snapshot, storedStatus: RfqStatus) => { setReference(snapshot.reference); setDocuments(snapshot.documents); setWeights(snapshot.weights); setStatus(storedStatus); setSavedId(id); setHistory(false); setStep(canCompare(snapshot.documents, snapshot.reference) ? 3 : 0); setNotice(""); };
  return <div className="min-h-screen bg-background text-foreground">
    <header className="bg-surface-inverse text-text-inverse"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8"><div className="flex items-center gap-3"><SaMonogram height={32} /><span aria-hidden="true" className="h-8 w-px bg-text-inverse/30" /><div><h1 className="text-xl font-medium">AeroQuote Compass</h1><p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-text-inverse/70">Strategic Procurement · Supplier Quotation Intelligence</p></div></div><div className="flex gap-2"><Button variant="ghost" className="text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse" disabled={busy} onClick={() => { setHistory(!history); setNotice(""); }}><HistoryIcon strokeWidth={1.5} />RFQ History</Button><Button variant="ghost" className="text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse" disabled={busy} onClick={() => { setReference({ ...newReference(), today: localToday() }); setDocuments([]); setSavedId(undefined); setStep(0); setHistory(false); setStatus("Draft"); setNotice(""); }}><Plus strokeWidth={1.5} />New RFQ</Button></div></div></header>
    <div className="border-b border-border-default bg-surface-raised"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8"><div className="flex items-center gap-3"><span className="font-mono text-xs">{reference.rfqNumber || "NEW RFQ"}</span><Status>{status}</Status></div><div className="flex items-center gap-2"><select aria-label="RFQ status" className={`${control} py-1 text-xs`} value={status} disabled={busy || (!ready && status === "Draft")} onChange={(e) => setStatus(e.target.value as RfqStatus)}>{["Draft", "Analyzing", "Completed", "Under Negotiation", "Awarded"].map((x) => <option key={x} disabled={x !== "Draft" && x !== "Analyzing" && !ready}>{x}</option>)}</select><Button variant="outline" size="sm" disabled={saving || busy} onClick={saveCurrent}><Save />{saving ? "Saving…" : "Save RFQ"}</Button></div></div></div>
    {!history && <nav aria-label="Analysis steps" className="mx-auto grid max-w-7xl grid-cols-2 border-b border-border-default px-5 sm:grid-cols-4 sm:px-8">{steps.map((label, i) => <Button key={label} variant="ghost" disabled={busy || (i === 3 && !ready)} onClick={() => { setStep(i); setNotice(""); }} className={`h-auto justify-start rounded-none border-b-2 px-2 py-5 text-xs sm:text-sm ${step === i ? "border-action-primary font-medium text-foreground" : "border-transparent text-text-tertiary"}`}><span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em]">{step === i && <span aria-hidden="true" className="inline-block size-1.5 bg-signal" />}0{i + 1}</span>{label}{i < step && <Check className="size-3 text-success" strokeWidth={1.5} />}</Button>)}</nav>}
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8">
      {notice && <div role="status" className="rounded-sm border border-border bg-muted px-4 py-3 text-sm">{notice}</div>}
      {history ? <History onOpen={open} /> : <>
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Sourcing workspace</p><h2 className="mt-1 text-4xl font-medium tracking-[-0.02em]">{steps[step]}</h2></div><Button variant="outline" size="sm" onClick={loadSamples} disabled={busy}>Load sample quotes</Button></div>
        {step === 0 && <Setup reference={reference} onChange={(r) => { setReference(r); if (status !== "Draft") setStatus("Draft"); }} />}
        {step === 1 && <Uploads documents={documents} busy={busy} onFiles={files} onPaste={(text) => { if (documents.length < MAX_FILES) setDocuments([...documents, { id: crypto.randomUUID(), text, fileName: `pasted-quote-${documents.length + 1}.txt`, fileType: "txt", status: "Ready", confirmed: false }]); }} onRemove={(id) => { setDocuments((ds) => ds.filter((d) => d.id !== id)); setStatus("Draft"); }} onProcess={(id) => process(id)} onName={(id, name) => { const d = documents.find((x) => x.id === id); if (d?.reviewed) edit(id, { ...d.reviewed, supplier_name: name }); }} />}
        {step === 2 && <Review documents={documents} onEdit={edit} onConfirm={(id) => { const d = documents.find((x) => x.id === id); if (d?.reviewed && !quoteErrors(d.reviewed).length) patch(id, { confirmed: true, status: "Extracted" }); }} onReset={(id, field) => { const d = documents.find((x) => x.id === id); if (d?.original && d.reviewed) edit(id, { ...d.reviewed, [field]: d.original[field] }); }} />}
        {step === 3 && ready && <Dashboard list={results} reference={reference} weights={weights} onWeights={setWeights} />}
        <div className="flex flex-wrap items-center justify-between gap-4"><Button variant="outline" disabled={busy || step === 0} onClick={() => setStep(step - 1)}><ArrowLeft />Back</Button><div className="flex items-center gap-3">{step === 2 && <span className="text-xs text-muted-foreground">{documents.filter((d) => d.confirmed).length} / {documents.length} quotations confirmed</span>}{step === 0 && <Button onClick={() => { if (validReference) setStep(1); else setNotice(referenceErrors(reference).join(" ")); }}>Continue to upload<ArrowRight /></Button>}{step === 1 && <Button disabled={busy || !documents.length || documents.some((d) => d.status === "Uploading")} onClick={() => process()}>{busy ? "Extracting quotations…" : "Extract quotations"}<ArrowRight /></Button>}{step === 2 && <Button disabled={!ready || busy} onClick={() => { setStep(3); setStatus("Completed"); }}>Compare & Decide<ArrowRight /></Button>}</div></div>
      </>}
    </main><footer className="border-t border-border-default"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8"><div className="flex items-center gap-3"><SaMonogram color="#0B302B" height={20} /><span className="font-serif text-lg font-light">Stephany Alves</span><span aria-hidden="true" className="h-5 w-px bg-border-strong/40" /><span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Signal &amp; Structure</span></div><div className="space-y-1 text-xs text-text-tertiary sm:text-right"><p className="font-medium text-foreground">AI extracts. Code calculates. You decide.</p><p>Synthetic sample data for portfolio purposes. No real company data.</p><p className="font-serif text-sm italic">Complexity, made clear.</p></div></div></footer>
  </div>;
}
