import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useRef } from "react";
import { ArrowRight, ArrowLeft, Save, History as HistoryIcon, Plus, Menu, Undo2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { StepNav, ProgressLine, TraceabilityMenu, DemoData, BulkConfirmDialog } from "@/components/rfq/shell";
import { mainSteps, progressSummary, MAIN_STEPS, TRACEABILITY, TRACE_OFFSET } from "@/lib/rfq/navigation";
import { bulkConfirmPlan } from "@/lib/rfq/bulk-confirm";
import { SaMonogram } from "@/assets/sa-monogram";
import { Button } from "@/components/ui/button";
import { extractQuote } from "@/lib/rfq/extract.functions";
import { saveHistory } from "@/lib/rfq/history.functions";
import { SAMPLE_QUOTES } from "@/lib/rfq/samples";
import { newReference, referenceErrors, canCompare, MAX_FILES, localToday, analysisDateFor, extractQueue, type QuoteDocument, type RfqStatus } from "@/lib/rfq/workflow";
import { readQuoteFile } from "@/lib/rfq/files";
import { compareDocuments, decisionInsights, DEFAULT_WEIGHTS } from "@/lib/rfq/intelligence";
import { Setup } from "@/components/rfq/setup";
import { Uploads } from "@/components/rfq/uploads";
import { Review } from "@/components/rfq/review";
import { Dashboard } from "@/components/rfq/dashboard";
import { History, type Snapshot } from "@/components/rfq/history";
import { Status, control } from "@/components/rfq/primitives";
import type { ExtractedQuote } from "@/lib/rfq/types";
import { createAuditEvent } from "@/lib/rfq/audit";
import type { AuditEvent, ReviewField } from "@/lib/rfq/review-types";
import { reviewSummary, confirmReviewFields, editReviewDocument, quotationConfirmationErrors, reliableFields, sameReviewValue, restoreReviewField, toggleReviewFollowUp } from "@/lib/rfq/review-issues";
import { workflowStages } from "@/lib/rfq/workflow-stages";
import { REVIEW_FIELDS } from "@/lib/rfq/workflow";
import { supabase } from "@/integrations/supabase/client";
import { createApprovedDecision, explainRecommendation, type ApprovedDecision } from "@/lib/rfq/recommendation";
import { buildLandedCostBreakdown } from "@/lib/rfq/landed-cost";
import { PoPanel } from "@/components/rfq/po-panel";
import { buildApprovedPoContext, emptyPoState, invalidatePoState, loadAndCheckPo, checkPurchaseOrder, purchaseOrderStatus, poSummary, resolvePoItem, releasePurchase, poResolutionAudit } from "@/lib/rfq/po-check";
import { demoPurchaseOrder, createPoFromApprovedDecision, type PoScenario } from "@/lib/rfq/po-samples";
import type { PoState, PoResolution } from "@/lib/rfq/po-types";
import { extendedSampleDocuments, confirmValidatedSamples, SAMPLE_CATALOG } from "@/lib/rfq/sample-catalog";
import { explorerRows } from "@/lib/rfq/quote-explorer";
import { demoRevisionRegistry, publishRevision, createSnapshot, appendSnapshot, detectRevisionChanges, createImpactAssessment, configurationGate, gateBlocked, revisionMatrix, verificationStatement, currentRevision, normRev, DEMO_DRAWING, type ConfigurationSnapshot, type ImpactAssessment, type CheckType } from "@/lib/rfq/revisions";
import { investigateFailure, confirmClassification, type FailureInvestigation } from "@/lib/rfq/investigation";
import { demoInvestigationCases } from "@/lib/rfq/investigation-demo";
import { buildTimeline } from "@/lib/rfq/audit-timeline";
import { QuoteExplorer } from "@/components/rfq/quote-explorer-panel";
import { ConfigurationPanel, GatePanel, RevisionStrip } from "@/components/rfq/configuration-panel";
import { AuditTrail } from "@/components/rfq/audit-trail";
import { InvestigationPanel } from "@/components/rfq/investigation-panel";
import { DEMO_BUYER } from "@/lib/rfq/audit";
const CASES = demoInvestigationCases();
const initialInvestigations = () => CASES.map((c) => investigateFailure(c.failure, c.snapshots, c.registry, c.manufacturedOn));

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "AeroQuote Compass — Strategic Procurement Intelligence" },
    { name: "description", content: "Review supplier quotations, compare annual landed costs and make transparent, data-driven aerospace sourcing decisions." },
    { property: "og:title", content: "AeroQuote Compass — Supplier Quotation Intelligence" },
    { property: "og:description", content: "AI extracts. Buyers validate. Deterministic cost and supplier scoring support your procurement decision." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});
const steps: string[] = [...MAIN_STEPS.map((m) => m.label), ...TRACEABILITY];
function Index() {
  const [reference, setReference] = useState(newReference);
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [step, setStep] = useState(0); const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false); const processing = useRef(false);
  const [notice, setNotice] = useState(""); const [status, setStatus] = useState<RfqStatus>("Draft");
  const [savedId, setSavedId] = useState<string | undefined>();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [approvedDecision, setApprovedDecision] = useState<ApprovedDecision>();
  const [poState, setPoState] = useState<PoState>(emptyPoState);
  const reopening = useRef(false);
  const [registry, setRegistry] = useState(demoRevisionRegistry);
  const [snapshots, setSnapshots] = useState<ConfigurationSnapshot[]>([]);
  const [assessments, setAssessments] = useState<ImpactAssessment[]>([]);
  const [investigations, setInvestigations] = useState<FailureInvestigation[]>(initialInvestigations);
  const [selected, setSelected] = useState<string[]>([]);
  const configAt = [reference.today, ...registry.map((r) => r.effectiveFrom)].filter(Boolean).sort().at(-1) ?? reference.today;
  const resetConfiguration = () => { setRegistry(demoRevisionRegistry()); setSnapshots([]); setAssessments([]); setInvestigations(initialInvestigations()); setSelected([]); };
  const snap = (checkType: CheckType, supplier: string, quoteRevision: string | null, foundRevision: string | null, extra: Partial<Pick<ConfigurationSnapshot, "result" | "divergences" | "tolerances" | "justifications" | "finalStatus" | "poNumber">> = {}) => {
    const cur = currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision ?? null;
    const match = normRev(foundRevision) === normRev(cur);
    const s = createSnapshot(registry, { id: crypto.randomUUID(), at: configAt, timestamp: reference.demoAnalysis ? `${configAt}T12:00:00.000Z` : new Date().toISOString(), checkType, actor: DEMO_BUYER, supplier, partNumber: reference.partNumber, quoteRevision, foundRevision,
      sourceDocuments: [DEMO_DRAWING, "ES-1180", reference.rfqNumber], result: extra.result ?? (match ? "Confirmed" : "Blocker"), divergences: extra.divergences ?? (match ? [] : [`Revision ${foundRevision ?? "not provided"} differs from current revision ${cur ?? "not provided"}.`]), tolerances: extra.tolerances ?? null, justifications: extra.justifications ?? [], finalStatus: extra.finalStatus ?? (match ? "Revision confirmed" : "Revision divergent"), poNumber: extra.poNumber ?? null });
    setSnapshots((list) => appendSnapshot(list, s));
  };
  useEffect(() => { if (reopening.current) { reopening.current = false; return; } if (approvedDecision || poState.po || poState.result) record({ action: "PO reset: approval invalidated", details: { status: "Awaiting PO", reason: "Reviewed quotation, RFQ or scoring weights changed." } }); setApprovedDecision(undefined); setPoState(invalidatePoState(poState)); }, [documents, reference, weights]);
  const record = (event: Omit<AuditEvent, "id" | "timestamp" | "actor">) => setAuditEvents((events) => [...events, createAuditEvent({ ...event, id: crypto.randomUUID(), timestamp: reference.demoAnalysis ? `${reference.today}T12:00:00.000Z` : new Date().toISOString() })]);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unsaved" | "failed">("idle");
  const skipDirty = useRef(true);
  useEffect(() => { if (skipDirty.current) { skipDirty.current = false; return; } setSaveState((s) => s === "saving" ? s : "unsaved"); }, [documents, reference, weights, approvedDecision, poState, registry, assessments]);
  const extract = useServerFn(extractQuote); const save = useServerFn(saveHistory);
  useEffect(() => setReference((r) => ({ ...r, today: r.today || localToday() })), []);
  const validReference = referenceErrors(reference).length === 0;
  const ready = canCompare(documents, reference);
  const results = useMemo(() => ready ? compareDocuments(documents, reference, weights) : [], [documents, reference, weights, ready]);
  const poContext = useMemo(() => { const supplier = results.find((a) => a.document.id === approvedDecision?.supplierId); if (!supplier || !approvedDecision) return null; try { return buildApprovedPoContext(reference, supplier, approvedDecision); } catch { return null; } }, [results, reference, approvedDecision]);
  const poStatus = purchaseOrderStatus(poState, Boolean(poContext));
  const poTimestamp = () => reference.demoAnalysis ? `${reference.today}T12:00:00.000Z` : new Date().toISOString();
  const loadPo = (scenario: PoScenario | "Created from approval") => { if (!poContext) return; const po = scenario === "Created from approval" ? createPoFromApprovedDecision(poContext) : demoPurchaseOrder(poContext, scenario); const next = loadAndCheckPo(po, poContext, poState.tolerances); setPoState(next); record({ action: scenario === "Created from approval" ? "PO created" : "PO loaded", newValue: po, details: { source: scenario } }); record({ action: "PO check executed", details: { counts: { confirmed: poSummary(next.result).confirmed, discrepancies: poSummary(next.result).discrepancies, blockers: poSummary(next.result).blockers }, tolerances: next.tolerances } }); if (purchaseOrderStatus(next) === "PO blocked") record({ action: "PO blocked", details: { poNumber: po.poNumber } }); snap("PO verification", po.supplier, poContext.quote.revision, po.revision, { poNumber: po.poNumber, tolerances: { ...next.tolerances }, result: poSummary(next.result).blockers || normRev(po.revision) !== normRev(currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision) ? "Blocker" : poSummary(next.result).discrepancies ? "Requires review" : "Confirmed", finalStatus: purchaseOrderStatus(next) }); };
  const checkPo = () => { if (!poContext || !poState.po) return; const result = checkPurchaseOrder(poState.po, poContext, poState.tolerances); setPoState({ ...poState, result, released: false }); record({ action: "PO check executed", details: { tolerances: result.tolerances, counts: { blockers: poSummary(result).blockers, discrepancies: poSummary(result).discrepancies, confirmed: poSummary(result).confirmed } } }); if (poSummary(result).blockers) record({ action: "PO blocked", details: { poNumber: poState.po.poNumber } }); snap("PO verification", poState.po.supplier, poContext.quote.revision, poState.po.revision, { poNumber: poState.po.poNumber, tolerances: { ...result.tolerances }, result: poSummary(result).blockers || normRev(poState.po.revision) !== normRev(currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision) ? "Blocker" : poSummary(result).discrepancies ? "Requires review" : "Confirmed", finalStatus: purchaseOrderStatus({ ...poState, result }) }); };
  const resolvePo = (id: string, action: PoResolution["action"], justification: string) => { if (!poState.result) return; try { const resolutions = resolvePoItem(poState.result, poState.resolutions, id, action, justification, poTimestamp()); setPoState({ ...poState, resolutions, released: false }); record(poResolutionAudit(poState.result, poState.po, id, action, justification)); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not resolve the discrepancy."); } };
  const releasePo = () => { if (gateBlocked(gate)) { record({ action: "PO blocked", details: { poNumber: poState.po?.poNumber, reason: "Configuration review blockers" } }); setNotice("Release blocked: resolve the configuration review blockers first."); return; } try { const next = releasePurchase(poState, Boolean(poContext)); setPoState(next); record({ action: "PO released", details: { poNumber: next.po?.poNumber, supplier: next.po?.supplier } }); } catch (e) { setNotice(e instanceof Error ? e.message : "Purchase cannot be released."); } };
  const recordDecision = (id: string, justification: string) => {
    try {
      const decision = createApprovedDecision(results, reference, weights, id, justification, reference.demoAnalysis ? `${reference.today}T12:00:00.000Z` : new Date().toISOString());
      const explanation = explainRecommendation(results, reference, weights);
      setApprovedDecision(decision);
      if (poState.po) record({ action: "PO reset: decision replaced", details: { status: "Awaiting PO" } });
      setPoState(emptyPoState());
      record({ action: "Weights used", details: { weights: { ...weights } } });
      for (const a of results) { const b = buildLandedCostBreakdown(a, { reference }); record({ action: "Landed-cost formula and assumptions", documentId: a.document.id, details: { formula: b.formula, total: b.annualTotal, assumptions: [a.combinedEstimate != null ? `Incoterm ${a.baseline.quote.incoterm ?? "not provided"} combined freight/insurance adder ${a.baseline.freightPct ?? 0}%` : "Quoted annual logistics used instead of the Incoterm adder", `FX USD/BRL ${reference.usdBrl}, EUR/BRL ${reference.eurBrl} as of ${reference.today}`, `Quote currency ${a.baseline.quote.currency ?? "not provided"}${b.inputs.fxRate != null ? ` at ${b.inputs.fxRate.toFixed(4)} to USD` : ""}`, a.oneTime ? `One-time costs USD ${Math.round(a.oneTime).toLocaleString("en-US")} included in full in the first-year annual total` : "No one-time costs"] } }); }
      record({ action: "Recommended supplier", ...(explanation.recommended ? { documentId: explanation.recommended.document.id } : {}), newValue: explanation.recommended?.name, details: { factors: explanation.winFactors, robustness: explanation.robustness } });
      record({ action: "Final decision", documentId: id, newValue: decision });
      snap("Decision approval", decision.supplier, documents.find((d) => d.id === id)?.reviewed?.revision ?? null, documents.find((d) => d.id === id)?.reviewed?.revision ?? null, { justifications: decision.justification ? [decision.justification] : [] });
      if (decision.override) record({ action: "Recommendation override", documentId: id, justification: decision.justification, previousValue: decision.recommendedSupplier, newValue: decision.supplier });
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not record this decision."); }
  };
  const patch = (id: string, update: Partial<QuoteDocument>) => setDocuments((ds) => ds.map((d) => d.id === id ? { ...d, ...update } : d));
  const edit = (id: string, q: ExtractedQuote) => {
    const d = documents.find((x) => x.id === id); if (!d?.reviewed) return;
    for (const f of REVIEW_FIELDS) if (!sameReviewValue(d.reviewed[f.key], q[f.key])) record({ action: "Field edited", documentId: id, field: f.key, previousValue: d.reviewed[f.key], newValue: q[f.key] });
    patch(id, editReviewDocument(d, q, new Date().toISOString())); setStatus("Draft");
  };
  const confirmField = (id: string, field: ReviewField) => { const d = documents.find((x) => x.id === id); if (!d?.reviewed) return; patch(id, confirmReviewFields(d, [field])); record({ action: "Field confirmed", documentId: id, field, newValue: d.reviewed[field] }); };
  const followUp = (id: string, field: ReviewField) => { const d = documents.find((x) => x.id === id); if (!d) return; const updated = toggleReviewFollowUp(d, field); patch(id, updated); const value = updated.fieldStatus?.[field]?.followUp; record({ action: value ? "Follow-up flagged" : "Follow-up cleared", documentId: id, field, newValue: value }); };
  const [bulkTarget, setBulkTarget] = useState<{ id?: string } | null>(null);
  const [undoDocs, setUndoDocs] = useState<{ docs: QuoteDocument[]; count: number } | null>(null);
  const bulkConfirm = (id?: string) => { const before = documents; const targets = documents.filter((d) => !d.excluded && (!id || d.id === id)).map((d) => ({ d, fields: reliableFields(d, documents, reference) })); setUndoDocs({ docs: before, count: targets.reduce((n, t) => n + t.fields.length, 0) }); setNotice(""); setDocuments((ds) => ds.map((d) => { const t = targets.find((x) => x.d.id === d.id); return t ? confirmReviewFields(d, t.fields) : d; })); for (const t of targets) if (t.fields.length) record({ action: "Bulk confirm", documentId: t.d.id, details: { fields: t.fields, count: t.fields.length } }); };
  const restoreField = (id: string, field: ReviewField) => { const d = documents.find((x) => x.id === id); if (!d?.original || !d.reviewed) return; patch(id, restoreReviewField(d, field, new Date().toISOString())); record({ action: "Field restored", documentId: id, field, previousValue: d.reviewed[field], newValue: d.original[field] }); setStatus("Draft"); };
  const loadSamples = () => {
    setAuditEvents([]); resetConfiguration();
    setReference((r) => ({ ...r, ...analysisDateFor(true), rfqNumber: "RFQ-24410", partNumber: "PN-45Y1258", revision: "C", annualVolume: 12, description: "Hydraulic actuator Y8", category: "Hydraulic systems", requiredDeliveryDate: "2027-03-15", deliveryLocation: "São José dos Campos", incumbentSupplier: "Meridian Flight Components LLC", targetCost: null }));
    setDocuments(SAMPLE_QUOTES.map((text, i) => ({ id: crypto.randomUUID(), text, fileName: ["atlas-quote.txt", "helix-quote.txt", "polar-quote.txt", "meridian-quote.txt"][i] ?? `sample-${i}.txt`, fileType: "txt", status: "Ready", confirmed: false })));
    setStep(1); setHistory(false); setStatus("Draft"); setSavedId(undefined); setNotice(""); setUndoDocs(null); skipDirty.current = true; setSaveState("idle");
  };
  const loadExtended = () => {
    loadSamples();
    const docs = extendedSampleDocuments(); setDocuments(docs);
    setAuditEvents(docs.map((d) => createAuditEvent({ id: crypto.randomUUID(), timestamp: `${analysisDateFor(true).today}T12:00:00.000Z`, action: "Extraction completed", documentId: d.id, newValue: d.original, details: { fileName: d.fileName, source: "Demo pre-extraction (synthetic, no AI call)", confidences: d.original?.confidence ?? {} } })));
    setStep(2);
  };
  const validateSamples = () => {
    const next = confirmValidatedSamples(documents); setDocuments(next);
    for (const d of next) { const sample = SAMPLE_CATALOG.find((x) => x.id === d.id); if (!sample) continue;
      if (d.excluded) record({ action: "Quotation held for validation", documentId: d.id, details: { reason: sample.scenario } });
      else { record({ action: "Quotation confirmed", documentId: d.id, newValue: d.reviewed, details: { source: "Demo buyer validation" } }); snap("Buyer validation", d.reviewed?.supplier_name ?? d.fileName, d.reviewed?.revision ?? null, sample.drawingRevision, { result: "Confirmed", finalStatus: "Buyer validated", divergences: normRev(d.reviewed?.revision) === normRev(reference.revision) ? [] : [`Quoted revision ${d.reviewed?.revision ?? "not provided"} differs from RFQ revision ${reference.revision}.`] }); }
    }
    setStatus("Draft");
  };
  const files = async (incoming: File[]) => {
    if (processing.current || documents.some((d) => d.status === "Uploading")) return;
    const capacity = MAX_FILES - documents.length;
    if (incoming.length > capacity) { setNotice(`A maximum of ${MAX_FILES} files is allowed per RFQ. No files added.`); return; }
    setReference((r) => ({ ...r, ...analysisDateFor(false) }));
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
          else { record({ action: "Extraction completed", documentId: d.id, newValue: r.quote, details: { fileName: d.fileName, analysisDate: reference.today, source: "AI extraction", confidences: r.quote.confidence ?? {} } }); patch(d.id, { original: structuredClone(r.quote), reviewed: structuredClone(r.quote), status: "Needs Review", confirmed: false, fieldStatus: {},
            // PDFs have no raw text; keep a short source text so fictitious-marker detection still works.
            text: d.text.trim() ? d.text : [r.quote.supplier_name, r.quote.notes].filter(Boolean).join(" — ") }); }
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
    setSaving(true); setSaveState("saving");
    try {
      const insight = decisionInsights(results, reference);
      const snapshot: Snapshot = { configuration: { registry, snapshots, assessments, investigations }, reference, documents, weights, auditEvents, poState, ...(approvedDecision ? { approvedDecision } : {}), summary: { supplier: insight.recommended?.name ?? null, landed: insight.recommended?.annualLanded ?? null, savings: insight.savings } };
      const result = await save({ data: { ...(savedId ? { id: savedId } : {}), rfqNumber: reference.rfqNumber, partNumber: reference.partNumber, status, snapshot: JSON.stringify(snapshot) } });
      setSavedId(result.id); setNotice("");
      setSaveState("saved"); skipDirty.current = true;
    } catch (e) { setSaveState("failed"); setNotice(e instanceof Error ? e.message : "Could not save this analysis."); } finally { setSaving(false); }
  };
  const open = (id: string, snapshot: Snapshot, storedStatus: RfqStatus) => { reopening.current = true; skipDirty.current = true; setSaveState("saved"); setAuditEvents(snapshot.auditEvents ?? []); setReference(snapshot.reference); setDocuments(snapshot.documents); setWeights(snapshot.weights); setStatus(storedStatus); setSavedId(id); setHistory(false); setStep(canCompare(snapshot.documents, snapshot.reference) ? 3 : 0); setNotice(""); setApprovedDecision(snapshot.approvedDecision); setPoState(snapshot.poState ?? emptyPoState()); setRegistry(snapshot.configuration?.registry ?? demoRevisionRegistry()); setSnapshots(snapshot.configuration?.snapshots ?? []); setAssessments(snapshot.configuration?.assessments ?? []); setInvestigations(snapshot.configuration?.investigations ?? initialInvestigations()); setSelected([]); };
  const recommendedId = useMemo(() => ready ? decisionInsights(results, reference).recommended?.document.id ?? null : null, [results, reference, ready]);
  const rows = useMemo(() => explorerRows(documents, results, reference.rfqNumber, recommendedId), [documents, results, reference.rfqNumber, recommendedId]);
  const alerts = useMemo(() => detectRevisionChanges(registry, snapshots, configAt), [registry, snapshots, configAt]);
  const gate = useMemo(() => configurationGate({ registry, at: configAt, poRevision: poState.po?.revision, quoteRevision: poContext?.quote.revision, alerts, assessments }), [registry, configAt, poState.po, poContext, alerts, assessments]);
  const lastOf = (t: CheckType) => [...snapshots].filter((x) => x.checkType === t).at(-1);
  const approvedQuote = documents.find((d) => d.id === approvedDecision?.supplierId)?.reviewed;
  const matrix = revisionMatrix(registry, configAt, [
    { stage: "RFQ", found: reference.revision, checkedAt: reference.today },
    { stage: "Quotation", found: approvedQuote?.revision ?? documents.find((d) => d.id === recommendedId)?.reviewed?.revision, checkedAt: lastOf("Buyer validation")?.timestamp ?? null, blockerOnMismatch: true },
    { stage: "Decision", found: lastOf("Decision approval")?.foundRevision, checkedAt: lastOf("Decision approval")?.timestamp ?? null, blockerOnMismatch: true },
    { stage: "PO", found: poState.po?.revision, checkedAt: lastOf("PO verification")?.timestamp ?? null, blockerOnMismatch: true },
    { stage: "Inspection", found: null, checkedAt: null },
  ]);
  const timeline = useMemo(() => buildTimeline({ registry, snapshots, audit: auditEvents, assessments, failures: CASES.map((c) => c.failure), investigations, supplierOf: (id) => rows.find((r) => r.id === id)?.supplier ?? "—", partNumber: reference.partNumber || "PN-45Y1258" }), [registry, snapshots, auditEvents, assessments, investigations, rows, reference.partNumber]);
  const publish = (input: { revision: string; effectiveFrom: string; changeReason: string }) => { try { const next = publishRevision(registry, { kind: "drawing", documentNumber: DEMO_DRAWING, revision: input.revision.trim().toUpperCase(), effectiveFrom: input.effectiveFrom, owner: "Rafael Lima (Demo engineer)", changeReason: input.changeReason }); setRegistry(next); record({ action: "New revision published", details: { document: DEMO_DRAWING, revision: input.revision, effectiveFrom: input.effectiveFrom } }); return null; } catch (e) { return e instanceof Error ? e.message : "Could not publish the revision."; } };
  const assess = (alert: (typeof alerts)[number], level: ImpactAssessment["level"], justification: string) => { try { const a = createImpactAssessment(alert, level, justification, DEMO_BUYER, poTimestamp()); setAssessments((xs) => [...xs, a]); record({ action: "Impact assessment recorded", justification, details: { alert: alert.key, level } }); return null; } catch (e) { return e instanceof Error ? e.message : "Could not record the assessment."; } };
  const confirmInvestigation = (failureId: string, c: FailureInvestigation["suggested"], note: string) => { try { setInvestigations((xs) => xs.map((i) => i.failureId === failureId ? confirmClassification(i, c, DEMO_BUYER, note) : i)); record({ action: "Investigation concluded", justification: note, details: { failureId, classification: c } }); return null; } catch (e) { return e instanceof Error ? e.message : "Could not confirm the classification."; } };
  const exportSummary = async (format: "pdf" | "xlsx" | "csv") => { try { const { buildDecisionSummary } = await import("@/lib/rfq/decision-summary"); const { exportDecisionSummary } = await import("@/lib/rfq/exports"); await exportDecisionSummary(format, buildDecisionSummary({ reference, documents, list: results, weights, approvedDecision, poState, poApproved: Boolean(poContext), snapshots, timeline }), reference); record({ action: "Decision summary exported", details: { source: format === "xlsx" ? "Excel" : format.toUpperCase() } }); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not export the summary."); } };
  const isSampleSet = documents.length > 0 && documents.every((d) => d.id.startsWith("sample-"));
  const stages = workflowStages({ documents, extracting: busy, comparisonComputed: results.length > 0, recommendationExists: Boolean(recommendedId), decisionApproved: Boolean(approvedDecision), hasPo: Boolean(poState.po), poChecked: Boolean(poState.result), poStatus, configurationBlocked: gateBlocked(gate), revisionMonitoring: alerts.length ? (alerts.some((al) => assessments.filter((z) => z.alertKey === al.key).at(-1)?.level !== "No known impact") ? "In review" : "Confirmed") : snapshots.length ? "Confirmed" : "Pending", investigationConfirmed: investigations.length > 0 && investigations.every((i) => i.confirmed) });
  const summaryCounts = reviewSummary(documents.filter((d) => !d.excluded), reference);
  const blockers = [
    ...(summaryCounts.critical ? [`${summaryCounts.critical} critical review ${summaryCounts.critical === 1 ? "item" : "items"} in Buyer Validation`] : []),
    ...(poStatus === "PO blocked" ? ["PO has critical discrepancies"] : []),
    ...(poState.po && gateBlocked(gate) ? ["Configuration review must be completed before release"] : []),
  ];
  const main = mainSteps(stages, validReference);
  const summary = progressSummary(main, Math.min(step, 5), blockers);
  const stepDisabled = (i: number): string | null => busy ? "Wait for extraction to finish." : i === 3 || i === 4 ? (ready ? null : "Confirm every quotation in Buyer Validation first.") : i === 5 ? (poContext ? null : "Record a decision first.") : null;
  const go = (i: number) => { setStep(i); setNotice(""); setHistory(false); if (i === 3) setStatus((st) => st === "Draft" ? "Completed" : st); };
  const allExtracted = documents.length > 0 && documents.every((d) => d.original);
  const continueAction: { label: string; run: () => void; reason: string | null } | null =
    step === 0 ? { label: "Continue to quotes", run: () => { if (validReference) go(1); else setNotice(referenceErrors(reference).join(" ")); }, reason: null }
    : step === 1 ? (extractQueue(documents).length || !allExtracted ? { label: busy ? "Extracting quotations…" : "Extract quotations", run: () => process(), reason: busy ? "Extraction in progress." : !documents.length ? "Add at least one quote." : documents.some((d) => d.status === "Uploading") ? "Wait for uploads to finish." : null } : { label: "Continue to validation", run: () => go(2), reason: null })
    : step === 2 ? { label: "Continue to compare", run: () => go(3), reason: ready ? null : "Confirm every quotation first." }
    : step === 3 ? { label: "Continue to decision", run: () => go(4), reason: null }
    : step === 4 ? { label: "Continue to PO & Release", run: () => go(5), reason: poContext ? null : "Record a decision first." }
    : null;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "failed" ? "Save failed" : saveState === "unsaved" ? "Unsaved changes" : "Not saved yet";
  const plan = bulkTarget ? bulkConfirmPlan(documents, reference, bulkTarget.id) : null;
  return <div className="min-h-screen bg-background text-foreground">
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface-card focus:p-2">Skip to content</a>
    <header className="bg-surface-inverse text-text-inverse"><div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-8 md:py-5">
      <div className="flex min-w-0 items-center gap-3"><SaMonogram height={28} /><span aria-hidden="true" className="hidden h-8 w-px bg-text-inverse/30 sm:block" /><div className="min-w-0"><h1 className="truncate text-lg font-medium md:text-xl">AeroQuote Compass</h1><p className="mt-0.5 hidden text-xs text-text-inverse/75 md:block">Strategic procurement · Supplier quotation intelligence</p></div></div>
      <div className="hidden gap-2 md:flex"><Button variant="ghost" className="text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse" disabled={busy} onClick={() => { setHistory(!history); setNotice(""); }}><HistoryIcon strokeWidth={1.5} />RFQ History</Button><Button variant="ghost" className="text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse" disabled={busy} onClick={() => { setAuditEvents([]); resetConfiguration(); setReference({ ...newReference(), today: localToday() }); setDocuments([]); setSavedId(undefined); setStep(0); setHistory(false); setStatus("Draft"); setNotice(""); skipDirty.current = true; setSaveState("idle"); }}><Plus strokeWidth={1.5} />New RFQ</Button></div>
      <div className="md:hidden"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Open menu" className="size-11 text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse"><Menu /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="min-h-11" disabled={busy} onSelect={() => { setHistory(!history); setNotice(""); }}><HistoryIcon />RFQ History</DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" disabled={busy} onSelect={() => { setAuditEvents([]); resetConfiguration(); setReference({ ...newReference(), today: localToday() }); setDocuments([]); setSavedId(undefined); setStep(0); setHistory(false); setStatus("Draft"); setNotice(""); skipDirty.current = true; setSaveState("idle"); }}><Plus />New RFQ</DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" disabled={busy} onSelect={() => go(0)}>Demo data</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-text-secondary">Traceability</DropdownMenuLabel>
        {TRACEABILITY.map((t, i) => <DropdownMenuItem key={t} className="min-h-11" onSelect={() => go(TRACE_OFFSET + i)}>{t}</DropdownMenuItem>)}
      </DropdownMenuContent></DropdownMenu></div>
    </div></header>
    <div className="border-b border-border-default bg-surface-raised"><div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 sm:px-8"><div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-xs">{reference.rfqNumber || "NEW RFQ"}</span><Status>{status}</Status><span role="status" aria-live="polite" className={`text-xs ${saveState === "failed" ? "text-error" : saveState === "unsaved" ? "text-warning" : saveState === "saved" ? "text-success" : "text-text-secondary"}`}>{saveLabel}</span></div><div className="flex items-center gap-2"><select aria-label="RFQ status" className={`${control} hidden py-1 text-xs sm:block`} value={status} disabled={busy || (!ready && status === "Draft")} onChange={(e) => setStatus(e.target.value as RfqStatus)}>{["Draft", "Analyzing", "Completed", "Under Negotiation", "Awarded"].map((x) => <option key={x} disabled={x !== "Draft" && x !== "Analyzing" && !ready}>{x}</option>)}</select><Button variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={saving || busy} onClick={saveCurrent}><Save />{saving ? "Saving…" : "Save RFQ"}</Button></div></div></div>
    {!history && <StepNav steps={main} current={step} summary={summary} disabled={stepDisabled} onSelect={go} />}
    <main id="main" className="mx-auto max-w-7xl min-w-0 space-y-6 px-4 pb-28 pt-6 sm:px-8 md:space-y-8 md:pb-10 md:pt-8">
      {notice && <div role="status" aria-live="polite" className="rounded-sm border border-border bg-muted px-4 py-3 text-sm">{notice}</div>}
      {undoDocs && <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-success bg-success-bg px-4 py-3 text-sm"><span className="text-success">Confirmed {undoDocs.count} reliable {undoDocs.count === 1 ? "field" : "fields"}.</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setDocuments(undoDocs.docs); record({ action: "Bulk confirm undone", details: { count: undoDocs.count } }); setUndoDocs(null); }}><Undo2 />Undo</Button><Button size="sm" variant="ghost" onClick={() => setUndoDocs(null)}>Dismiss</Button></div></div>}
      {history ? <History onOpen={open} /> : <>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="hidden text-xs text-text-secondary md:block">{step >= TRACE_OFFSET ? "Traceability" : summary.position}</p><h2 className="mt-1 break-words text-2xl font-medium tracking-[-0.02em] md:text-4xl">{steps[step]}</h2></div><div className="hidden md:block"><TraceabilityMenu current={step} onSelect={go} /></div></div>
        {step < TRACE_OFFSET && <ProgressLine summary={{ ...summary, current: main[step]! }} stages={main[step]!.stages} />}
        {reference.demoAnalysis && <p className="text-sm text-text-secondary">Demo analysis date (synthetic): {reference.today}</p>}
        {step === 0 && <DemoData hasData={documents.length > 0 || auditEvents.length > 0} busy={busy} onClassic={loadSamples} onExtended={loadExtended} />}
        {step === 0 && <Setup reference={reference} onChange={(r) => { setReference(r); if (status !== "Draft") setStatus("Draft"); }} />}
        {step === 1 && <Uploads documents={documents} busy={busy} onFiles={files} onPaste={(text) => { setReference((r) => ({ ...r, ...analysisDateFor(false) })); if (documents.length < MAX_FILES) setDocuments([...documents, { id: crypto.randomUUID(), text, fileName: `pasted-quote-${documents.length + 1}.txt`, fileType: "txt", status: "Ready", confirmed: false }]); }} onRemove={(id) => { setDocuments((ds) => ds.filter((d) => d.id !== id)); setStatus("Draft"); }} onProcess={(id) => process(id)} onName={(id, name) => { const d = documents.find((x) => x.id === id); if (d?.reviewed) edit(id, { ...d.reviewed, supplier_name: name }); }} />}
        {step === 2 && isSampleSet && documents.some((d) => !d.confirmed && !d.excluded) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-default bg-surface-card p-4 text-sm"><p>Demo shortcut: confirm every quotation marked validated in the synthetic catalog. Quotations with missing or low-confidence critical fields stay held for individual buyer validation.</p><Button size="sm" onClick={validateSamples}>Validate sample quotes (demo)</Button></div>}
        {step === 2 && <Review documents={documents} reference={reference} onEdit={edit} onFieldConfirm={confirmField} onFollowUp={followUp} onBulkConfirm={(id) => setBulkTarget(id ? { id } : {})} onReset={restoreField} onConfirm={(id) => { const d = documents.find((x) => x.id === id); if (d && !quotationConfirmationErrors(d).length) { patch(id, { confirmed: true, status: "Extracted", excluded: false }); record({ action: "Quotation confirmed", documentId: id, newValue: d.reviewed }); snap("Buyer validation", d.reviewed?.supplier_name ?? d.fileName, d.reviewed?.revision ?? null, d.reviewed?.revision ?? null, { result: "Confirmed", finalStatus: "Buyer validated" }); } }} />}
        {step === 5 && poContext && <RevisionStrip registry={registry} snapshots={snapshots} at={configAt} blocked={gateBlocked(gate)} />}
        {step === 5 && poContext && poState.po && <GatePanel items={gate} statement={verificationStatement(registry, configAt, configAt)} />}
        {step === 6 && <ConfigurationPanel registry={registry} snapshots={snapshots} at={configAt} alerts={alerts} assessments={assessments} matrix={matrix} onPublish={publish} onAssess={assess} />}
        {step === 7 && <AuditTrail events={timeline} onExport={exportSummary} />}
        {step === 8 && <InvestigationPanel cases={CASES} investigations={investigations} onConfirm={confirmInvestigation} />}
        {step === 5 && <PoPanel configurationBlocked={gateBlocked(gate)} context={poContext} state={poState} onLoad={loadPo} onCheck={checkPo} onResolve={resolvePo} onRelease={releasePo} onEdit={(po) => { setPoState({ ...poState, po, resolutions: [], released: false, result: undefined }); record({ action: "PO edited", newValue: po, details: { status: "PO awaiting check" } }); }} onTolerances={(tolerances) => { setPoState({ ...poState, tolerances, result: undefined, resolutions: [], released: false }); record({ action: "PO tolerances changed", details: { tolerances } }); }} />}
        {step === 3 && ready && documents.length > 4 && <QuoteExplorer rows={rows} selected={selected} onSelected={setSelected} />}
        {(step === 3 || step === 4) && ready && <Dashboard view={step === 3 ? "compare" : "decision"} onSummary={exportSummary} selected={selected} list={results} reference={reference} weights={weights} onWeights={(w) => { record({ action: "Weights changed", details: { previousWeights: { ...weights }, weights: { ...w } } }); setWeights(w); }} approvedDecision={approvedDecision} onRecord={recordDecision} />}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-raised px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0"><div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><Button variant="outline" className="min-h-11 md:min-h-9" disabled={busy || step === 0} onClick={() => go(step >= TRACE_OFFSET ? 5 : step - 1)}><ArrowLeft />Back</Button><div className="flex min-w-0 items-center justify-end gap-3">{step === 2 && <span className="hidden text-xs text-text-secondary sm:inline">{documents.filter((d) => d.confirmed).length} / {documents.length} quotations confirmed</span>}{continueAction && continueAction.reason && <span id="continue-reason" className="hidden min-w-0 text-xs text-text-secondary sm:inline">{continueAction.reason}</span>}{continueAction && <Button className="min-h-11 min-w-0 md:min-h-9" aria-describedby={continueAction.reason ? "continue-reason" : undefined} disabled={Boolean(continueAction.reason)} title={continueAction.reason ?? undefined} onClick={continueAction.run}><span className="truncate">{continueAction.label}</span><ArrowRight /></Button>}</div></div></div>
        <BulkConfirmDialog plan={plan} scopeLabel={bulkTarget?.id ? "This quotation" : "All quotations"} onCancel={() => setBulkTarget(null)} onConfirm={() => { bulkConfirm(bulkTarget?.id); setBulkTarget(null); }} />
      </>}
    </main><footer className="border-t border-border-default"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8"><div className="flex items-center gap-3"><SaMonogram color="#0B302B" height={20} /><span className="font-serif text-lg font-light">Stephany Alves</span><span aria-hidden="true" className="h-5 w-px bg-border-strong/40" /><span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Signal &amp; Structure</span></div><div className="space-y-1 text-xs text-text-tertiary sm:text-right"><p className="font-medium text-foreground">AI extracts. Code calculates. You decide.</p><p>Synthetic sample data for portfolio purposes. No real company data.</p><p className="font-serif text-sm italic">Complexity, made clear.</p></div></div></footer>
  </div>;
}
