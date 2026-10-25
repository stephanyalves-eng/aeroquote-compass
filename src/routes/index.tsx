import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useRef } from "react";
import { Compass, ArrowRight, ArrowLeft, Save, History as HistoryIcon, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractQuote } from "@/lib/rfq/extract.functions";
import { saveHistory } from "@/lib/rfq/history.functions";
import { SAMPLE_QUOTES } from "@/lib/rfq/samples";
import { newReference, referenceErrors, canCompare, quoteErrors, MAX_FILES, type QuoteDocument, type RfqStatus } from "@/lib/rfq/workflow";
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
  useEffect(() => setReference((r) => ({ ...r, today: r.today || new Date().toISOString().slice(0, 10) })), []);
  const validReference = referenceErrors(reference).length === 0;
  const ready = canCompare(documents, reference);
  const results = useMemo(() => ready ? compareDocuments(documents, reference, weights) : [], [documents, reference, weights, ready]);
  const patch = (id: string, update: Partial<QuoteDocument>) => setDocuments((ds) => ds.map((d) => d.id === id ? { ...d, ...update } : d));
  const edit = (id: string, q: ExtractedQuote) => { patch(id, { reviewed: q, confirmed: false, status: "Needs Review" }); setStatus("Draft"); };
  const loadSamples = () => {
    setReference((r) => ({ ...r, rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, description: "Hydraulic actuator Y8", category: "Hydraulic systems", requiredDeliveryDate: "", deliveryLocation: "São José dos Campos", incumbentSupplier: "", targetCost: null }));
    setDocuments(SAMPLE_QUOTES.map((text, i) => ({ id: crypto.randomUUID(), text, fileName: ["atlas-quote.txt", "helix-quote.txt", "polar-quote.txt"][i] ?? `sample-${i}.txt`, fileType: "txt", status: "Ready", confirmed: false })));
    setStep(1); setHistory(false); setStatus("Draft"); setSavedId(undefined); setNotice("");
  };
  const files = async (incoming: File[]) => {
    if (processing.current) return;
    const capacity = MAX_FILES - documents.length;
    if (incoming.length > capacity) { setNotice(`A maximum of ${MAX_FILES} files is allowed per RFQ. No files added.`); return; }
    const added: QuoteDocument[] = incoming.map((f) => ({ id: crypto.randomUUID(), text: "", fileName: f.name, fileType: f.name.split(".").pop()?.toLowerCase() ?? "", status: "Uploading", confirmed: false }));
    setDocuments((ds) => [...ds, ...added]); setNotice(""); setStatus("Draft");
    await Promise.all(incoming.map(async (f, i) => { const d = added[i]; if (!d) return; try { const content = await readQuoteFile(f); patch(d.id, { ...content, status: "Ready" }); } catch (e) { patch(d.id, { status: "Error", error: e instanceof Error ? e.message : "Corrupted file." }); } }));
  };
  const process = async (id?: string) => {
    if (processing.current) return;
    if (!validReference) { setNotice(referenceErrors(reference).join(" ")); setStep(0); return; }
    processing.current = true; setBusy(true); setStatus("Analyzing"); setNotice("");
    const queue = documents.filter((d) => (id ? d.id === id : !d.confirmed) && (d.text.trim() || d.pdfBase64) && d.status !== "Uploading");
    let failed = false;
    try {
      // Sequential requests avoid overwhelming the shared AI rate limit.
      for (const d of queue) {
        patch(d.id, { status: "Processing", confirmed: false, error: undefined });
        try {
          const r = await extract({ data: { text: d.text, pdfBase64: d.pdfBase64, today: reference.today, fileName: d.fileName } });
          if (!r.quote || r.error) { patch(d.id, { status: "Error", error: r.error ?? "Extraction failed." }); failed = true; if (/credits|blocked|configured/i.test(r.error ?? "")) break; }
          else patch(d.id, { original: structuredClone(r.quote), reviewed: structuredClone(r.quote), status: "Needs Review", confirmed: false });
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
      const snapshot: Snapshot = { reference, documents: documents.map((d) => ({ ...d, pdfBase64: undefined })), weights, summary: { supplier: insight.recommended?.name ?? null, landed: insight.recommended?.annualLanded ?? null, savings: insight.savings } };
      const result = await save({ data: { ...(savedId ? { id: savedId } : {}), rfqNumber: reference.rfqNumber, partNumber: reference.partNumber, status, snapshot: JSON.stringify(snapshot) } });
      setSavedId(result.id); setNotice("RFQ analysis saved privately.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save this analysis."); } finally { setSaving(false); }
  };
  const open = (id: string, snapshot: Snapshot, storedStatus: RfqStatus) => { setReference(snapshot.reference); setDocuments(snapshot.documents); setWeights(snapshot.weights); setStatus(storedStatus); setSavedId(id); setHistory(false); setStep(canCompare(snapshot.documents, snapshot.reference) ? 3 : 0); setNotice(""); };
  return <div className="min-h-screen bg-background text-foreground">
    <header className="bg-petrol text-petrol-foreground"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8"><div className="flex items-center gap-3"><Compass className="size-9 text-mint" strokeWidth={1.4} /><div><h1 className="text-xl font-semibold">AeroQuote Compass</h1><p className="mt-0.5 text-xs opacity-80">Strategic Procurement · Supplier Quotation Intelligence</p></div></div><div className="flex gap-2"><Button variant="ghost" className="text-petrol-foreground hover:bg-petrol hover:text-mint" disabled={busy} onClick={() => { setHistory(!history); setNotice(""); }}><HistoryIcon />RFQ History</Button><Button variant="ghost" className="text-petrol-foreground hover:bg-petrol hover:text-mint" disabled={busy} onClick={() => { setReference({ ...newReference(), today: new Date().toISOString().slice(0, 10) }); setDocuments([]); setSavedId(undefined); setStep(0); setHistory(false); setStatus("Draft"); setNotice(""); }}><Plus />New RFQ</Button></div></div></header>
    <div className="border-b border-border bg-muted"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8"><div className="flex items-center gap-3"><span className="font-mono text-xs">{reference.rfqNumber || "NEW RFQ"}</span><Status>{status}</Status></div><div className="flex items-center gap-2"><select aria-label="RFQ status" className={`${control} py-1 text-xs`} value={status} disabled={busy || (!ready && status === "Draft")} onChange={(e) => setStatus(e.target.value as RfqStatus)}>{["Draft", "Analyzing", "Completed", "Under Negotiation", "Awarded"].map((x) => <option key={x} disabled={x !== "Draft" && x !== "Analyzing" && !ready}>{x}</option>)}</select><Button variant="outline" size="sm" disabled={saving || busy} onClick={saveCurrent}><Save />{saving ? "Saving…" : "Save RFQ"}</Button></div></div></div>
    {!history && <nav aria-label="Analysis steps" className="mx-auto grid max-w-[1500px] grid-cols-2 border-b border-border px-5 sm:grid-cols-4 sm:px-8">{steps.map((label, i) => <Button key={label} variant="ghost" disabled={busy || (i === 3 && !ready)} onClick={() => { setStep(i); setNotice(""); }} className={`h-auto justify-start rounded-none border-b-2 px-2 py-5 text-xs sm:text-sm ${step === i ? "border-petrol font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}><span className="font-mono text-xs">0{i + 1}</span>{label}{i < step && <Check className="size-3" />}</Button>)}</nav>}
    <main className="mx-auto max-w-[1500px] space-y-8 px-5 py-8 sm:px-8">
      {notice && <div role="status" className="rounded-sm border border-border bg-muted px-4 py-3 text-sm">{notice}</div>}
      {history ? <History onOpen={open} /> : <>
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-medium uppercase text-muted-foreground">Sourcing workspace</p><h2 className="mt-1 text-2xl font-semibold">{steps[step]}</h2></div><Button variant="outline" size="sm" onClick={loadSamples} disabled={busy}>Load sample quotes</Button></div>
        {step === 0 && <Setup reference={reference} onChange={(r) => { setReference(r); if (status !== "Draft") setStatus("Draft"); }} />}
        {step === 1 && <Uploads documents={documents} busy={busy} onFiles={files} onPaste={(text) => { if (documents.length < MAX_FILES) setDocuments([...documents, { id: crypto.randomUUID(), text, fileName: `pasted-quote-${documents.length + 1}.txt`, fileType: "txt", status: "Ready", confirmed: false }]); }} onRemove={(id) => { setDocuments((ds) => ds.filter((d) => d.id !== id)); setStatus("Draft"); }} onProcess={(id) => process(id)} onName={(id, name) => { const d = documents.find((x) => x.id === id); if (d?.reviewed) edit(id, { ...d.reviewed, supplier_name: name }); }} />}
        {step === 2 && <Review documents={documents} onEdit={edit} onConfirm={(id) => { const d = documents.find((x) => x.id === id); if (d?.reviewed && !quoteErrors(d.reviewed).length) patch(id, { confirmed: true, status: "Extracted" }); }} onReset={(id, field) => { const d = documents.find((x) => x.id === id); if (d?.original && d.reviewed) edit(id, { ...d.reviewed, [field]: d.original[field] }); }} />}
        {step === 3 && ready && <Dashboard list={results} reference={reference} weights={weights} onWeights={setWeights} />}
        <div className="flex flex-wrap items-center justify-between gap-4"><Button variant="outline" disabled={busy || step === 0} onClick={() => setStep(step - 1)}><ArrowLeft />Back</Button><div className="flex items-center gap-3">{step === 2 && <span className="text-xs text-muted-foreground">{documents.filter((d) => d.confirmed).length} / {documents.length} quotations confirmed</span>}{step === 0 && <Button onClick={() => { if (validReference) setStep(1); else setNotice(referenceErrors(reference).join(" ")); }}>Continue to upload<ArrowRight /></Button>}{step === 1 && <Button disabled={busy || !documents.length || documents.some((d) => d.status === "Uploading")} onClick={() => process()}>{busy ? "Extracting quotations…" : "Extract quotations"}<ArrowRight /></Button>}{step === 2 && <Button disabled={!ready || busy} onClick={() => { setStep(3); setStatus("Completed"); }}>Compare & Decide<ArrowRight /></Button>}</div></div>
      </>}
    </main><footer className="border-t border-border"><div className="mx-auto max-w-[1500px] space-y-1 px-5 py-6 text-xs text-muted-foreground sm:px-8"><p className="font-medium text-foreground">AI extracts. Code calculates. You decide.</p><p>Synthetic sample data for portfolio purposes. No real company data. Built by Stephany Alves.</p></div></footer>
  </div>;
}
