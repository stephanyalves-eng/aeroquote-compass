import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveView, viewSlug, HISTORY_VIEW } from "@/lib/rfq/view-route";
import { browserStorage, readDraft, writeDraft, clearDraft, reviveReferenceNumbers, shouldWarnBeforeUnload } from "@/lib/rfq/draft-storage";
import { suggestedRfqStatus, rfqStatusMismatch, viewProgressLabel } from "@/lib/rfq/rfq-status";
import { identityLabel, ownerLabel, auditActor } from "@/lib/rfq/identity";
import { workspaceHasRfq } from "@/lib/rfq/unsaved-work";
import { blankRfqReference } from "@/lib/rfq/workflow";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { weeklyRecommendationsQuery } from "@/lib/rfq/weekly-recommendations-query";
import { WEEKLY_RECOMMENDATION_SNAPSHOT } from "@/lib/rfq/weekly-recommendations";
import { syncWeeklyRecommendations } from "@/lib/rfq/weekly-recommendations-sync";
import { ArrowRight, ArrowLeft, Save, Undo2 } from "lucide-react";
import { DemoData, BulkConfirmDialog } from "@/components/rfq/shell";
import {
  ErpSidebar,
  MobileNav,
  GlobalSearch,
  Notifications,
  Breadcrumb,
  DemoUser,
  ProcessStepper,
  RecordHeader,
  DashboardView,
} from "@/components/rfq/erp-shell";
import { erpProcessSteps, DASHBOARD_STEP } from "@/lib/rfq/erp-nav";
import { buildSearchEntries, globalSearch } from "@/lib/rfq/search";
import { requiresAttention } from "@/lib/rfq/operations";
import { MAIN_STEPS, TRACEABILITY, TRACE_OFFSET } from "@/lib/rfq/navigation";
import { ScenarioPanel } from "@/components/rfq/scenario-panel";
import { OperationalPanel } from "@/components/rfq/operational-panel";
import { firstInvalidField } from "@/lib/rfq/reference-fields";
import { operationalSummary, scopeSyntheticEvidence } from "@/lib/rfq/operations";
import { workspaceFingerprint, workspaceSaveStatus, hasUnsavedWork, SAVE_STATUS_LABEL, type SaveBaseline } from "@/lib/rfq/unsaved-work";
import { bulkConfirmPlan } from "@/lib/rfq/bulk-confirm";
import { pendingReviewBlockers } from "@/lib/rfq/presentation";
import { SaMonogram } from "@/assets/sa-monogram";
import { Button } from "@/components/ui/button";
import { extractQuote } from "@/lib/rfq/extract.functions";
import { extractionInput } from "@/lib/rfq/extraction-limits";
import { saveHistory } from "@/lib/rfq/history.functions";
import { SAMPLE_QUOTES } from "@/lib/rfq/samples";
import {
  referenceErrors,
  canCompare,
  MAX_FILES,
  localToday,
  analysisDateFor,
  extractQueue,
  type QuoteDocument,
  type RfqStatus,
} from "@/lib/rfq/workflow";
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
import {
  reviewSummary,
  confirmReviewFields,
  editReviewDocument,
  quotationConfirmationErrors,
  reliableFields,
  sameReviewValue,
  restoreReviewField,
  toggleReviewFollowUp,
  setAllReviewFollowUp,
} from "@/lib/rfq/review-issues";
import { workflowStages } from "@/lib/rfq/workflow-stages";
import { REVIEW_FIELDS } from "@/lib/rfq/workflow";
import { supabase } from "@/integrations/supabase/client";
import {
  createApprovedDecision,
  explainRecommendation,
  shouldMeasureBuyerConfirmedRecommendation,
  RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT,
  type ApprovedDecision,
} from "@/lib/rfq/recommendation";
import { buildLandedCostBreakdown } from "@/lib/rfq/landed-cost";
import { PoPanel } from "@/components/rfq/po-panel";
import { PoWorkspace } from "@/components/rfq/po-workspace";
import {
  recordSupplierConfirmation,
  supplierConfirmationAudit,
  shouldMeasureConfirmedRecommendation,
  RFQ_CONFIRMED_RECOMMENDATION_EVENT,
  type ConfirmationInput,
} from "@/lib/rfq/po-confirmation";
import {
  startPoDraft,
  savePoDraft,
  transitionPo,
  lifecycleStatus,
  lifecycleAudit,
  draftEditAudit,
  poVerificationAllowed,
  type PoLifecycleAction,
} from "@/lib/rfq/po-lifecycle";
import {
  buildApprovedPoContext,
  emptyPoState,
  invalidatePoState,
  loadAndCheckPo,
  checkPurchaseOrder,
  purchaseOrderStatus,
  poSummary,
  resolvePoItem,
  releasePurchase,
  poResolutionAudit,
} from "@/lib/rfq/po-check";
import {
  demoPurchaseOrder,
  createPoFromApprovedDecision,
  type PoScenario,
} from "@/lib/rfq/po-samples";
import type { PoState, PoResolution } from "@/lib/rfq/po-types";
import {
  extendedSampleDocuments,
  confirmValidatedSamples,
  SAMPLE_CATALOG,
} from "@/lib/rfq/sample-catalog";
import { explorerRows } from "@/lib/rfq/quote-explorer";
import {
  demoRevisionRegistry,
  publishRevision,
  createSnapshot,
  appendSnapshot,
  detectRevisionChanges,
  createImpactAssessment,
  configurationGate,
  gateBlocked,
  revisionMatrix,
  verificationStatement,
  currentRevision,
  normRev,
  DEMO_DRAWING,
  type ConfigurationSnapshot,
  type ImpactAssessment,
  type CheckType,
} from "@/lib/rfq/revisions";
import {
  investigateFailure,
  confirmClassification,
  type FailureInvestigation,
} from "@/lib/rfq/investigation";
import { demoInvestigationCases } from "@/lib/rfq/investigation-demo";
import { buildTimeline } from "@/lib/rfq/audit-timeline";
import { QuoteExplorer } from "@/components/rfq/quote-explorer-panel";
import { ConfigurationPanel, GatePanel, RevisionStrip } from "@/components/rfq/configuration-panel";
import { AuditTrail } from "@/components/rfq/audit-trail";
import { InvestigationPanel } from "@/components/rfq/investigation-panel";
const CASES = demoInvestigationCases();
const initialInvestigations = () =>
  CASES.map((c) => investigateFailure(c.failure, c.snapshots, c.registry, c.manufacturedOn));

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search["view"] === "string" && search["view"] ? { view: search["view"] } : {},
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(weeklyRecommendationsQuery);
    } catch {
      context.queryClient.setQueryData(weeklyRecommendationsQuery.queryKey, {
        ...WEEKLY_RECOMMENDATION_SNAPSHOT,
        unavailable: true,
      });
    }
    return { weeklyState: dehydrate(context.queryClient) };
  },
  head: () => ({
    meta: [
      { title: "AeroQuote Compass — Strategic Procurement Intelligence" },
      {
        name: "description",
        content:
          "Review supplier quotations, compare annual landed costs and make transparent, data-driven aerospace sourcing decisions.",
      },
      { property: "og:title", content: "AeroQuote Compass — Supplier Quotation Intelligence" },
      {
        property: "og:description",
        content:
          "AI extracts. Buyers validate. Deterministic cost and supplier scoring support your procurement decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HydratedIndex,
});
interface DraftWorkspace {
  reference: Snapshot["reference"];
  documents: QuoteDocument[];
  weights?: Snapshot["weights"];
  status?: RfqStatus | null;
  approvedDecision?: ApprovedDecision;
  poState?: PoState;
  registry?: ReturnType<typeof demoRevisionRegistry>;
  snapshots?: ConfigurationSnapshot[];
  assessments?: ImpactAssessment[];
  investigations?: FailureInvestigation[];
  auditEvents?: AuditEvent[];
  savedId?: string;
}
function HydratedIndex() {
  const { weeklyState } = Route.useLoaderData();
  return (
    <HydrationBoundary state={weeklyState}>
      <Index />
    </HydrationBoundary>
  );
}
const steps: string[] = [...MAIN_STEPS.map((m) => m.label), ...TRACEABILITY];
function Index() {
  const queryClient = useQueryClient();
  const metricInFlight = useRef(false);
  const [reference, setReference] = useState(blankRfqReference);
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const setStep = (i: number, replace = false) => {
    void navigate({ search: i === DASHBOARD_STEP ? {} : { view: viewSlug(i) }, replace });
  };
  /** Leaving history happens through setStep; only opening it navigates. */
  const setHistory = (on: boolean) => {
    if (on) void navigate({ search: { view: HISTORY_VIEW } });
  };
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [storedFingerprint, setStoredFingerprint] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string | null; name: string | null } | null>(null);
  const actor = auditActor(user);
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const [notice, setNotice] = useState("");
  /** null = follow the status suggested by workflow evidence; a value = buyer's manual choice. */
  const [manualStatus, setStatus] = useState<RfqStatus | null>(null);
  const [savedId, setSavedId] = useState<string | undefined>();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [approvedDecision, setApprovedDecision] = useState<ApprovedDecision>();
  const [poState, setPoState] = useState<PoState>(emptyPoState);
  const [poDraftDirty, setPoDraftDirty] = useState(false);
  const reopening = useRef(false);
  const [registry, setRegistry] = useState(demoRevisionRegistry);
  const [snapshots, setSnapshots] = useState<ConfigurationSnapshot[]>([]);
  const [assessments, setAssessments] = useState<ImpactAssessment[]>([]);
  const [investigations, setInvestigations] =
    useState<FailureInvestigation[]>(initialInvestigations);
  const [selected, setSelected] = useState<string[]>([]);
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const configAt =
    [reference.today, ...registry.map((r) => r.effectiveFrom)].filter(Boolean).sort().at(-1) ??
    reference.today;
  const resetConfiguration = () => {
    setRegistry(demoRevisionRegistry());
    setSnapshots([]);
    setAssessments([]);
    setInvestigations(initialInvestigations());
    setSelected([]);
    setFilteredIds(null);
  };
  const snap = (
    checkType: CheckType,
    supplier: string,
    quoteRevision: string | null,
    foundRevision: string | null,
    extra: Partial<
      Pick<
        ConfigurationSnapshot,
        "result" | "divergences" | "tolerances" | "justifications" | "finalStatus" | "poNumber"
      >
    > = {},
  ) => {
    const cur = currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision ?? null;
    const match = normRev(foundRevision) === normRev(cur);
    const s = createSnapshot(registry, {
      id: crypto.randomUUID(),
      at: configAt,
      timestamp: reference.demoAnalysis ? `${configAt}T12:00:00.000Z` : new Date().toISOString(),
      checkType,
      actor,
      supplier,
      partNumber: reference.partNumber,
      quoteRevision,
      foundRevision,
      sourceDocuments: [DEMO_DRAWING, "ES-1180", reference.rfqNumber],
      result: extra.result ?? (match ? "Confirmed" : "Blocker"),
      divergences:
        extra.divergences ??
        (match
          ? []
          : [
              `Revision ${foundRevision ?? "not provided"} differs from current revision ${cur ?? "not provided"}.`,
            ]),
      tolerances: extra.tolerances ?? null,
      justifications: extra.justifications ?? [],
      finalStatus: extra.finalStatus ?? (match ? "Revision confirmed" : "Revision divergent"),
      poNumber: extra.poNumber ?? null,
    });
    setSnapshots((list) => appendSnapshot(list, s));
  };
  useEffect(() => {
    if (reopening.current) {
      reopening.current = false;
      return;
    }
    if (approvedDecision || poState.po || poState.result)
      record({
        action: "PO reset: approval invalidated",
        details: {
          status: "Awaiting PO",
          reason: "Reviewed quotation, RFQ or scoring weights changed.",
        },
      });
    setApprovedDecision(undefined);
    setPoState(invalidatePoState(poState));
  }, [documents, reference, weights]);
  const record = (event: Omit<AuditEvent, "id" | "timestamp" | "actor">) =>
    setAuditEvents((events) => [
      ...events,
      createAuditEvent({
        ...event,
        id: crypto.randomUUID(),
        timestamp: reference.demoAnalysis
          ? `${reference.today}T12:00:00.000Z`
          : new Date().toISOString(),
      }, actor),
    ]);
  const measureBuyerRecommendation = (next: QuoteDocument[]) => {
    if (
      metricInFlight.current ||
      !shouldMeasureBuyerConfirmedRecommendation(next, reference, weights, auditEvents)
    )
      return;
    metricInFlight.current = true;
    const milestone = createAuditEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT,
    }, actor);
    setAuditEvents((events) => [...events, milestone]);
    void syncWeeklyRecommendations({ id: milestone.id, synthetic: Boolean(reference.demoAnalysis) })
      .then(() => queryClient.invalidateQueries({ queryKey: weeklyRecommendationsQuery.queryKey }))
      .catch(() =>
        setNotice(
          "Weekly totals could not update. The confirmation is retained and will retry automatically.",
        ),
      );
  };
  useEffect(() => {
    const retry = () => {
      void syncWeeklyRecommendations()
        .then((changed) => {
          if (changed)
            void queryClient.invalidateQueries({ queryKey: weeklyRecommendationsQuery.queryKey });
        })
        .catch(() => {
          /* Retained in the retry outbox. */
        });
    };
    retry();
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [queryClient]);
  const [saving, setSaving] = useState(false);
  const [showSetupErrors, setShowSetupErrors] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unsaved" | "failed">(
    "idle",
  );
  const fingerprint = useMemo(
    () =>
      workspaceFingerprint({
        reference,
        documents,
        weights,
        status: manualStatus,
        approvedDecision,
        poState,
        registry,
        snapshots,
        assessments,
        investigations,
        auditEvents,
      }),
    [reference, documents, weights, manualStatus, approvedDecision, poState, registry, snapshots, assessments, investigations, auditEvents],
  );
  const [baseline, setBaseline] = useState<SaveBaseline>({ fingerprint: null, saved: false });
  /** null = baseline settled; boolean = capture the next workspace state as baseline (true = saved). */
  const rebaseline = useRef<boolean | null>(false);
  const [baselineTick, setBaselineTick] = useState(0);
  const resetBaseline = (saved: boolean) => {
    rebaseline.current = saved;
    setBaselineTick((t) => t + 1);
  };
  useEffect(() => {
    if (rebaseline.current === null) return;
    setBaseline({ fingerprint, saved: rebaseline.current });
    rebaseline.current = null;
  }, [fingerprint, baselineTick]);
  const unsavedWork = hasUnsavedWork(fingerprint, baseline, poDraftDirty);
  const workspaceStatus = workspaceSaveStatus(fingerprint, baseline, poDraftDirty);
  const workspaceUnsaved = hasUnsavedWork(fingerprint, baseline);
  // Restore a locally stored draft once, after hydration.
  useEffect(() => {
    const draft = readDraft<DraftWorkspace>(browserStorage());
    const w = draft?.workspace;
    if (w?.reference && Array.isArray(w.documents)) {
      reopening.current = true;
      setReference(reviveReferenceNumbers(w.reference as unknown as Record<string, unknown>) as unknown as typeof w.reference);
      setDocuments(w.documents);
      if (w.weights) setWeights(w.weights);
      setStatus(w.status ?? null);
      setApprovedDecision(w.approvedDecision);
      setPoState(w.poState ?? emptyPoState());
      setRegistry(w.registry ?? demoRevisionRegistry());
      setSnapshots(w.snapshots ?? []);
      setAssessments(w.assessments ?? []);
      setInvestigations(w.investigations ?? initialInvestigations());
      setAuditEvents(w.auditEvents ?? []);
      setSavedId(w.savedId);
      rebaseline.current = null;
      setBaseline({ fingerprint: "restored-draft", saved: false });
      setDraftRestored(true);
    }
    setDraftReady(true);
  }, []);
  // Debounced autosave of the draft; cleared when the workspace is pristine or saved.
  useEffect(() => {
    if (!draftReady) return;
    const storage = browserStorage();
    if (!workspaceUnsaved) {
      clearDraft(storage);
      setStoredFingerprint(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const ok = writeDraft(
        storage,
        { reference, documents, weights, status: manualStatus, approvedDecision, poState, registry, snapshots, assessments, investigations, auditEvents, savedId },
        new Date().toISOString(),
      );
      setStoredFingerprint(ok ? fingerprint : null);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [fingerprint, workspaceUnsaved, draftReady, savedId]);
  useEffect(() => {
    let active = true;
    const apply = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (!active) return;
      setUser(u ? { email: u.email ?? null, name: typeof u.user_metadata?.["full_name"] === "string" ? (u.user_metadata["full_name"] as string) : null } : null);
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const warnOnLeave = shouldWarnBeforeUnload({
    unsaved: workspaceUnsaved,
    poFormDirty: poDraftDirty,
    current: fingerprint,
    storedFingerprint,
  });
  useEffect(() => {
    if (!warnOnLeave) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [warnOnLeave]);
  const extract = useServerFn(extractQuote);
  const save = useServerFn(saveHistory);
  useEffect(() => setReference((r) => ({ ...r, today: r.today || localToday() })), []);
  const validReference = referenceErrors(reference).length === 0;
  const ready = canCompare(documents, reference);
  const results = useMemo(
    () => (ready ? compareDocuments(documents, reference, weights) : []),
    [documents, reference, weights, ready],
  );
  const poContext = useMemo(() => {
    const supplier = results.find((a) => a.document.id === approvedDecision?.supplierId);
    if (!supplier || !approvedDecision) return null;
    try {
      return buildApprovedPoContext(reference, supplier, approvedDecision);
    } catch {
      return null;
    }
  }, [results, reference, approvedDecision]);
  const poStatus = purchaseOrderStatus(poState, Boolean(poContext));
  const resolvedView = resolveView(search.view, {
    ready,
    decision: Boolean(poContext),
    hasDocuments: documents.length > 0,
  });
  const step = resolvedView.step;
  const history = resolvedView.history;
  useEffect(() => {
    if (!draftReady || !resolvedView.reason) return;
    setNotice(resolvedView.reason);
    setStep(resolvedView.step, true);
  }, [draftReady, resolvedView.reason, resolvedView.step]);
  const poTimestamp = () =>
    reference.demoAnalysis ? `${reference.today}T12:00:00.000Z` : new Date().toISOString();
  const loadPo = (scenario: PoScenario | "Created from approval") => {
    if (!poContext) return;
    const po =
      scenario === "Created from approval"
        ? createPoFromApprovedDecision(poContext)
        : demoPurchaseOrder(poContext, scenario);
    if (scenario === "Created from approval") {
      if (
        poState.po &&
        !window.confirm(
          "Replace the current PO with a new draft? The audit and check snapshots are retained.",
        )
      )
        return;
      const next = {
        ...startPoDraft(po, poTimestamp(), actor),
        supplierConfirmations: poState.supplierConfirmations,
        tolerances: { ...poState.tolerances },
        lifecycle: {
          ...startPoDraft(po, poTimestamp(), actor).lifecycle,
          history: poState.lifecycle?.issued
            ? [
                ...poState.lifecycle.history,
                {
                  po: structuredClone(poState.lifecycle.issued),
                  status: "Superseded" as const,
                  revision: poState.lifecycle.revision,
                  timestamp: poTimestamp(),
                  actor,
                },
              ]
            : (poState.lifecycle?.history ?? []),
          phase: "Draft" as const,
          revision: (poState.lifecycle?.revision ?? 0) + 1,
          updatedAt: poTimestamp(),
          actor,
        },
      };
      setPoState(next);
      record(lifecycleAudit("Draft created", poState, next));
      return;
    }
    const next = loadAndCheckPo(po, poContext, poState.tolerances);
    next.supplierConfirmations = poState.supplierConfirmations;
    next.lifecycle = {
      phase: "Awaiting release",
      revision: (poState.lifecycle?.revision ?? 0) + 1,
      issued: structuredClone(po),
      updatedAt: poTimestamp(),
      actor,
      history: [
        ...(poState.lifecycle?.history ?? []),
        ...(poState.po
          ? [
              {
                po: structuredClone(poState.lifecycle?.issued ?? poState.po),
                status: "Superseded" as const,
                revision: poState.lifecycle?.revision ?? 1,
                timestamp: poTimestamp(),
                actor,
              },
            ]
          : []),
      ],
    };
    setPoState(next);
    record({
      action: "PO loaded",
      newValue: po,
      details: { source: scenario },
    });
    window.__lovableEvents?.track?.("project.po_validated", {
      synthetic: Boolean(po.synthetic),
      blockers: poSummary(next.result).blockers,
      discrepancies: poSummary(next.result).discrepancies,
      valid: Boolean(
        next.result && !next.result.validationErrors.length && !poSummary(next.result).blockers,
      ),
    });
    if (next.result && (poSummary(next.result).blockers || next.result.validationErrors.length))
      window.__lovableEvents?.track?.("project.po_blocked", {
        synthetic: Boolean(po.synthetic),
        reason: "verification",
        blockers: poSummary(next.result).blockers,
      });
    record({
      action: "PO check executed",
      details: {
        counts: {
          confirmed: poSummary(next.result).confirmed,
          discrepancies: poSummary(next.result).discrepancies,
          blockers: poSummary(next.result).blockers,
        },
        tolerances: next.tolerances,
      },
    });
    if (purchaseOrderStatus(next) === "PO blocked")
      record({ action: "PO blocked", details: { poNumber: po.poNumber } });
    snap("PO verification", po.supplier, poContext.quote.revision, po.revision, {
      poNumber: po.poNumber,
      tolerances: { ...next.tolerances },
      result:
        poSummary(next.result).blockers ||
        normRev(po.revision) !==
          normRev(currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision)
          ? "Blocker"
          : poSummary(next.result).discrepancies
            ? "Requires review"
            : "Confirmed",
      finalStatus: purchaseOrderStatus(next),
    });
  };
  const checkPo = () => {
    if (!poContext || !poState.po || !poVerificationAllowed(poState)) return;
    const result = checkPurchaseOrder(poState.po, poContext, poState.tolerances);
    setPoState({ ...poState, result, released: false });
    window.__lovableEvents?.track?.("project.po_validated", {
      synthetic: Boolean(poState.po.synthetic),
      blockers: poSummary(result).blockers,
      discrepancies: poSummary(result).discrepancies,
      valid: !result.validationErrors.length && !poSummary(result).blockers,
    });
    if (poSummary(result).blockers || result.validationErrors.length)
      window.__lovableEvents?.track?.("project.po_blocked", {
        synthetic: Boolean(poState.po.synthetic),
        reason: "verification",
        blockers: poSummary(result).blockers,
      });
    record({
      action: "PO check executed",
      details: {
        tolerances: result.tolerances,
        counts: {
          blockers: poSummary(result).blockers,
          discrepancies: poSummary(result).discrepancies,
          confirmed: poSummary(result).confirmed,
        },
      },
    });
    if (poSummary(result).blockers)
      record({ action: "PO blocked", details: { poNumber: poState.po.poNumber } });
    snap("PO verification", poState.po.supplier, poContext.quote.revision, poState.po.revision, {
      poNumber: poState.po.poNumber,
      tolerances: { ...result.tolerances },
      result:
        poSummary(result).blockers ||
        normRev(poState.po.revision) !==
          normRev(currentRevision(registry, "drawing", DEMO_DRAWING, configAt)?.revision)
          ? "Blocker"
          : poSummary(result).discrepancies
            ? "Requires review"
            : "Confirmed",
      finalStatus: purchaseOrderStatus({ ...poState, result }),
    });
  };
  const resolvePo = (id: string, action: PoResolution["action"], justification: string) => {
    if (!poState.result) return;
    try {
      const resolutions = resolvePoItem(
        poState.result,
        poState.resolutions,
        id,
        action,
        justification,
        poTimestamp(),
        actor,
      );
      setPoState({ ...poState, resolutions, released: false });
      record(poResolutionAudit(poState.result, poState.po, id, action, justification));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not resolve the discrepancy.");
    }
  };
  const releasePo = () => {
    if (gateBlocked(gate)) {
      window.__lovableEvents?.track?.("project.po_blocked", {
        synthetic: Boolean(poState.po?.synthetic),
        reason: "configuration",
        blockers: poSummary(poState.result, poState.resolutions).blockers,
      });
      record({
        action: "PO blocked",
        details: { poNumber: poState.po?.poNumber, reason: "Configuration review blockers" },
      });
      setNotice("Release blocked: resolve the configuration review blockers first.");
      return;
    }
    try {
      const next = poState.lifecycle
        ? transitionPo(
            poState,
            "Release",
            poTimestamp(),
            actor,
            Boolean(poContext),
            gateBlocked(gate),
          )
        : releasePurchase(poState, Boolean(poContext));
      setPoState(next);
      record({
        action: "PO released",
        details: { poNumber: next.po?.poNumber, supplier: next.po?.supplier },
      });
      window.__lovableEvents?.track?.("project.po_released", {
        synthetic: Boolean(next.po?.synthetic),
      });
    } catch (e) {
      window.__lovableEvents?.track?.("project.po_blocked", {
        synthetic: Boolean(poState.po?.synthetic),
        reason: "release_gate",
        blockers: poSummary(poState.result, poState.resolutions).blockers,
      });
      setNotice(e instanceof Error ? e.message : "Purchase cannot be released.");
    }
  };
  const changePoLifecycle = (action: PoLifecycleAction) => {
    try {
      const next = transitionPo(
        poState,
        action,
        poTimestamp(),
        actor,
        Boolean(poContext),
        gateBlocked(gate),
      );
      setPoState(next);
      record(lifecycleAudit(action, poState, next));
      if (action === "Issue")
        window.__lovableEvents?.track?.("project.po_issued", {
          synthetic: Boolean(next.po?.synthetic),
        });
      if (action === "Release")
        window.__lovableEvents?.track?.("project.po_released", {
          synthetic: Boolean(next.po?.synthetic),
        });
    } catch (e) {
      if (["Confirm verification", "Prepare release", "Release"].includes(action))
        window.__lovableEvents?.track?.("project.po_blocked", {
          synthetic: Boolean(poState.po?.synthetic),
          reason: gateBlocked(gate) ? "configuration" : "release_gate",
          blockers: poSummary(poState.result, poState.resolutions).blockers,
        });
      setNotice(e instanceof Error ? e.message : "Could not update the purchase order.");
    }
  };
  const saveSupplierConfirmation = (input: ConfirmationInput) => {
    try {
      const next = recordSupplierConfirmation(poState, input, poTimestamp(), actor);
      setPoState(next);
      record(supplierConfirmationAudit(poState, next));
      if (
        shouldMeasureConfirmedRecommendation(
          next,
          Boolean(poContext && decisionInsights(results, reference).recommended),
          auditEvents,
        ) &&
        window.__lovableEvents?.track
      ) {
        window.__lovableEvents?.track?.("project.rfq_recommended_after_supplier_confirmation", {
          synthetic: Boolean(next.po?.synthetic),
        });
        record({
          action: RFQ_CONFIRMED_RECOMMENDATION_EVENT,
          details: {
            source:
              "Weekly metric: first supplier confirmation with a current eligible recommendation",
          },
        });
      }
      setNotice("Supplier confirmation recorded.");
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not record supplier confirmation.");
      return false;
    }
  };
  const recordDecision = (id: string, justification: string) => {
    try {
      const decision = createApprovedDecision(
        results,
        reference,
        weights,
        id,
        justification,
        reference.demoAnalysis ? `${reference.today}T12:00:00.000Z` : new Date().toISOString(),
        actor,
      );
      const explanation = explainRecommendation(results, reference, weights);
      setApprovedDecision(decision);
      if (poState.po)
        record({ action: "PO reset: decision replaced", details: { status: "Awaiting PO" } });
      setPoState(emptyPoState());
      record({ action: "Weights used", details: { weights: { ...weights } } });
      for (const a of results) {
        const b = buildLandedCostBreakdown(a, { reference });
        record({
          action: "Landed-cost formula and assumptions",
          documentId: a.document.id,
          details: {
            formula: b.formula,
            total: b.annualTotal,
            assumptions: [
              a.combinedEstimate != null
                ? `Incoterm ${a.baseline.quote.incoterm ?? "not provided"} combined freight/insurance adder ${a.baseline.freightPct ?? 0}%`
                : "Quoted annual logistics used instead of the Incoterm adder",
              `FX USD/BRL ${reference.usdBrl}, EUR/BRL ${reference.eurBrl} as of ${reference.today}`,
              `Quote currency ${a.baseline.quote.currency ?? "not provided"}${b.inputs.fxRate != null ? ` at ${b.inputs.fxRate.toFixed(4)} to USD` : ""}`,
              a.oneTime
                ? `One-time costs USD ${Math.round(a.oneTime).toLocaleString("en-US")} included in full in the first-year annual total`
                : "No one-time costs",
            ],
          },
        });
      }
      record({
        action: "Recommended supplier",
        ...(explanation.recommended ? { documentId: explanation.recommended.document.id } : {}),
        newValue: explanation.recommended?.name,
        details: { factors: explanation.winFactors, robustness: explanation.robustness },
      });
      record({ action: "Final decision", documentId: id, newValue: decision });
      snap(
        "Decision approval",
        decision.supplier,
        documents.find((d) => d.id === id)?.reviewed?.revision ?? null,
        documents.find((d) => d.id === id)?.reviewed?.revision ?? null,
        { justifications: decision.justification ? [decision.justification] : [] },
      );
      if (decision.override)
        record({
          action: "Recommendation override",
          documentId: id,
          justification: decision.justification,
          previousValue: decision.recommendedSupplier,
          newValue: decision.supplier,
        });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not record this decision.");
    }
  };
  const patch = (id: string, update: Partial<QuoteDocument>) =>
    setDocuments((ds) => ds.map((d) => (d.id === id ? { ...d, ...update } : d)));
  const edit = (id: string, q: ExtractedQuote) => {
    const d = documents.find((x) => x.id === id);
    if (!d?.reviewed) return;
    for (const f of REVIEW_FIELDS)
      if (!sameReviewValue(d.reviewed[f.key], q[f.key]))
        record({
          action: "Field edited",
          documentId: id,
          field: f.key,
          previousValue: d.reviewed[f.key],
          newValue: q[f.key],
        });
    patch(id, editReviewDocument(d, q, new Date().toISOString()));
    setStatus(null);
  };
  const confirmField = (id: string, field: ReviewField) => {
    const d = documents.find((x) => x.id === id);
    if (!d?.reviewed) return;
    patch(id, confirmReviewFields(d, [field]));
    record({ action: "Field confirmed", documentId: id, field, newValue: d.reviewed[field] });
  };
  const followUp = (id: string, field: ReviewField) => {
    const d = documents.find((x) => x.id === id);
    if (!d) return;
    const updated = toggleReviewFollowUp(d, field);
    patch(id, updated);
    const value = updated.fieldStatus?.[field]?.followUp;
    record({
      action: value ? "Follow-up flagged" : "Follow-up cleared",
      documentId: id,
      field,
      newValue: value,
    });
  };
  const [bulkTarget, setBulkTarget] = useState<{ id?: string } | null>(null);
  const allFollowUp = (id: string, flagged: boolean) => {
    const d = documents.find((quote) => quote.id === id);
    if (!d?.original || !d.reviewed) return;
    patch(id, setAllReviewFollowUp(d, flagged));
    for (const field of REVIEW_FIELDS) {
      if (Boolean(d.fieldStatus?.[field.key]?.followUp) === flagged) continue;
      record({ action: flagged ? "Follow-up flagged" : "Follow-up cleared", documentId: id, field: field.key, newValue: flagged });
    }
  };
  const [undoDocs, setUndoDocs] = useState<{ docs: QuoteDocument[]; count: number } | null>(null);
  const bulkConfirm = (id?: string) => {
    const before = documents;
    const targets = documents
      .filter((d) => !d.excluded && (!id || d.id === id))
      .map((d) => ({ d, fields: reliableFields(d, documents, reference) }));
    setUndoDocs({ docs: before, count: targets.reduce((n, t) => n + t.fields.length, 0) });
    setNotice("");
    setDocuments((ds) =>
      ds.map((d) => {
        const t = targets.find((x) => x.d.id === d.id);
        return t ? confirmReviewFields(d, t.fields) : d;
      }),
    );
    for (const t of targets)
      if (t.fields.length)
        record({
          action: "Bulk confirm",
          documentId: t.d.id,
          details: { fields: t.fields, count: t.fields.length },
        });
  };
  const restoreField = (id: string, field: ReviewField) => {
    const d = documents.find((x) => x.id === id);
    if (!d?.original || !d.reviewed) return;
    patch(id, restoreReviewField(d, field, new Date().toISOString()));
    record({
      action: "Field restored",
      documentId: id,
      field,
      previousValue: d.reviewed[field],
      newValue: d.original[field],
    });
    setStatus(null);
  };
  const loadSamples = () => {
    metricInFlight.current = false;
    setAuditEvents([]);
    resetConfiguration();
    setReference((r) => ({
      ...r,
      ...analysisDateFor(true),
      rfqNumber: "RFQ-24410",
      partNumber: "PN-45Y1258",
      revision: "C",
      annualVolume: 12,
      description: "Hydraulic actuator Y8",
      category: "Hydraulic systems",
      requiredDeliveryDate: "2027-03-15",
      deliveryLocation: "São José dos Campos",
      incumbentSupplier: "Meridian Flight Components LLC",
      targetCost: null,
    }));
    setDocuments(
      SAMPLE_QUOTES.map((text, i) => ({
        id: crypto.randomUUID(),
        text,
        fileName:
          ["atlas-quote.txt", "helix-quote.txt", "polar-quote.txt", "meridian-quote.txt"][i] ??
          `sample-${i}.txt`,
        fileType: "txt",
        status: "Ready",
        confirmed: false,
      })),
    );
    setStep(1);
    setHistory(false);
    setStatus(null);
    setSavedId(undefined);
    setNotice("");
    setUndoDocs(null);
    setSaveState("idle");
  };
  const loadExtended = () => {
    loadSamples();
    const docs = extendedSampleDocuments();
    setDocuments(docs);
    setAuditEvents(
      docs.map((d) =>
        createAuditEvent({
          id: crypto.randomUUID(),
          timestamp: `${analysisDateFor(true).today}T12:00:00.000Z`,
          action: "Extraction completed",
          documentId: d.id,
          newValue: d.original,
          details: {
            fileName: d.fileName,
            source: "Demo pre-extraction (synthetic, no AI call)",
            confidences: d.original?.confidence ?? {},
          },
        }, actor),
      ),
    );
    setStep(2);
  };
  const validateSamples = () => {
    const next = confirmValidatedSamples(documents);
    setDocuments(next);
    if (shouldMeasureBuyerConfirmedRecommendation(next, reference, weights, auditEvents)) {
      window.__lovableEvents?.track?.("project.rfq_recommended_after_buyer_confirmation", {
        synthetic: Boolean(reference.demoAnalysis),
      });
      measureBuyerRecommendation(next);
    }
    for (const d of next) {
      const sample = SAMPLE_CATALOG.find((x) => x.id === d.id);
      if (!sample) continue;
      if (d.excluded)
        record({
          action: "Quotation held for validation",
          documentId: d.id,
          details: { reason: sample.scenario },
        });
      else {
        record({
          action: "Quotation confirmed",
          documentId: d.id,
          newValue: d.reviewed,
          details: { source: "Demo buyer validation" },
        });
        snap(
          "Buyer validation",
          d.reviewed?.supplier_name ?? d.fileName,
          d.reviewed?.revision ?? null,
          sample.drawingRevision,
          {
            result: "Confirmed",
            finalStatus: "Buyer validated",
            divergences:
              normRev(d.reviewed?.revision) === normRev(reference.revision)
                ? []
                : [
                    `Quoted revision ${d.reviewed?.revision ?? "not provided"} differs from RFQ revision ${reference.revision}.`,
                  ],
          },
        );
      }
    }
    setStatus(null);
  };
  const files = async (incoming: File[]) => {
    if (processing.current || documents.some((d) => d.status === "Uploading")) return;
    const capacity = MAX_FILES - documents.length;
    if (incoming.length > capacity) {
      setNotice(`A maximum of ${MAX_FILES} files is allowed per RFQ. No files added.`);
      return;
    }
    setReference((r) => ({ ...r, ...analysisDateFor(false) }));
    const added: QuoteDocument[] = incoming.map((f) => ({
      id: crypto.randomUUID(),
      text: "",
      fileName: f.name,
      fileType: f.name.split(".").pop()?.toLowerCase() ?? "",
      status: "Uploading",
      confirmed: false,
    }));
    setDocuments((ds) => [...ds, ...added]);
    setNotice("");
    setStatus(null);
    await Promise.all(
      incoming.map(async (f, i) => {
        const d = added[i];
        if (!d) return;
        try {
          const content = await readQuoteFile(f);
          patch(d.id, { ...content, status: "Ready" });
        } catch (e) {
          patch(d.id, {
            status: "Error",
            error: e instanceof Error ? e.message : "Corrupted file.",
          });
        }
      }),
    );
  };
  const process = async (id?: string) => {
    if (processing.current) return;
    if (!validReference) {
      setNotice(referenceErrors(reference).join(" "));
      setStep(0);
      return;
    }
    if (id) {
      const target = documents.find((d) => d.id === id);
      if (
        target?.original &&
        target.reviewed &&
        JSON.stringify(target.original) !== JSON.stringify(target.reviewed) &&
        !window.confirm(
          "Reprocessing will overwrite the buyer's manual edits for this quotation. Continue?",
        )
      )
        return;
    }
    processing.current = true;
    setBusy(true);
    const queue = extractQueue(documents, id);
    let failed = false;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        setNotice(
          "Sign in to extract quotations with AI. Demo data, comparison and exports remain public.",
        );
        setHistory(true);
        return;
      }
      setStatus("Analyzing");
      setNotice("");
      // Sequential requests avoid overwhelming the shared AI rate limit.
      for (const d of queue) {
        patch(d.id, { status: "Processing", confirmed: false, error: undefined });
        try {
          const input = extractionInput.safeParse({
            text: d.pdfBase64 ? undefined : d.text,
            pdfBase64: d.pdfBase64,
            today: reference.today,
            fileName: d.fileName,
          });
          if (!input.success) {
            patch(d.id, {
              status: "Error",
              error:
                "Provide quotation text up to 60,000 characters or a valid PDF up to 6 MB, with a valid analysis date.",
            });
            failed = true;
            continue;
          }
          const r = await extract({
            data: input.data,
          });
          if (!r.quote || r.error) {
            patch(d.id, { status: "Error", error: r.error ?? "Extraction failed." });
            failed = true;
            if (/credits|blocked|configured/i.test(r.error ?? "")) break;
          } else {
            record({
              action: "Extraction completed",
              documentId: d.id,
              newValue: r.quote,
              details: {
                fileName: d.fileName,
                analysisDate: reference.today,
                source: "AI extraction",
                confidences: r.quote.confidence ?? {},
              },
            });
            patch(d.id, {
              original: structuredClone(r.quote),
              reviewed: structuredClone(r.quote),
              status: "Needs Review",
              confirmed: false,
              fieldStatus: {},
              // PDFs have no raw text; keep a short source text so fictitious-marker detection still works.
              text: d.text.trim()
                ? d.text
                : [r.quote.supplier_name, r.quote.notes].filter(Boolean).join(" — "),
            });
          }
        } catch {
          patch(d.id, { status: "Error", error: "Extraction failed. Reprocess this quotation." });
          failed = true;
          break;
        }
      }
      if (failed)
        setNotice(
          "Some quotations could not be extracted. Resolve or remove failed files before comparison.",
        );
      setStep(2);
      setStatus(null);
    } finally {
      processing.current = false;
      setBusy(false);
    }
  };
  const saveCurrent = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setNotice("Sign in to save this analysis privately.");
      setHistory(true);
      return;
    }
    if (!reference.rfqNumber || !reference.partNumber) {
      setNotice("RFQ number and part number are required to save.");
      return;
    }
    setSaving(true);
    setSaveState("saving");
    try {
      const insight = decisionInsights(results, reference);
      const snapshot: Snapshot = {
        configuration: { registry, snapshots, assessments, investigations },
        reference,
        documents,
        weights,
        auditEvents,
        poState,
        ...(approvedDecision ? { approvedDecision } : {}),
        summary: {
          supplier: insight.recommended?.name ?? null,
          landed: insight.recommended?.annualLanded ?? null,
          savings: insight.savings,
        },
      };
      const result = await save({
        data: {
          ...(savedId ? { id: savedId } : {}),
          rfqNumber: reference.rfqNumber,
          partNumber: reference.partNumber,
          status,
          snapshot: JSON.stringify(snapshot),
        },
      });
      setSavedId(result.id);
      setNotice("");
      setSaveState("idle");
      setBaseline({ fingerprint, saved: true });
    } catch (e) {
      setSaveState("failed");
      setNotice(e instanceof Error ? e.message : "Could not save this analysis.");
    } finally {
      setSaving(false);
    }
  };
  const open = (id: string, snapshot: Snapshot, storedStatus: RfqStatus) => {
    metricInFlight.current = false;
    const metric = snapshot.auditEvents?.find(
      (event) => event.action === RFQ_BUYER_CONFIRMED_RECOMMENDATION_EVENT,
    );
    if (metric)
      void syncWeeklyRecommendations({
        id: metric.id,
        synthetic: Boolean(snapshot.reference.demoAnalysis),
      })
        .then(() =>
          queryClient.invalidateQueries({ queryKey: weeklyRecommendationsQuery.queryKey }),
        )
        .catch(() => setNotice("Weekly totals will retry automatically."));
    reopening.current = true;
    setSaveState("idle");
    resetBaseline(true);
    setAuditEvents(snapshot.auditEvents ?? []);
    setReference(snapshot.reference);
    setDocuments(snapshot.documents);
    setWeights(snapshot.weights);
    setStatus(storedStatus);
    setSavedId(id);
    setHistory(false);
    setStep(canCompare(snapshot.documents, snapshot.reference) ? 3 : 0);
    setNotice("");
    setApprovedDecision(snapshot.approvedDecision);
    setPoState(snapshot.poState ?? emptyPoState());
    setRegistry(snapshot.configuration?.registry ?? demoRevisionRegistry());
    setSnapshots(snapshot.configuration?.snapshots ?? []);
    setAssessments(snapshot.configuration?.assessments ?? []);
    setInvestigations(snapshot.configuration?.investigations ?? initialInvestigations());
    setSelected([]);
  };
  const recommendedId = useMemo(
    () => (ready ? (decisionInsights(results, reference).recommended?.document.id ?? null) : null),
    [results, reference, ready],
  );
  const rows = useMemo(
    () => explorerRows(documents, results, reference.rfqNumber, recommendedId),
    [documents, results, reference.rfqNumber, recommendedId],
  );
  const alerts = useMemo(
    () => detectRevisionChanges(registry, snapshots, configAt),
    [registry, snapshots, configAt],
  );
  const gate = useMemo(
    () =>
      configurationGate({
        registry,
        at: configAt,
        poRevision: poState.po?.revision,
        quoteRevision: poContext?.quote.revision,
        alerts,
        assessments,
      }),
    [registry, configAt, poState.po, poContext, alerts, assessments],
  );
  const lastOf = (t: CheckType) => [...snapshots].filter((x) => x.checkType === t).at(-1);
  const approvedQuote = documents.find((d) => d.id === approvedDecision?.supplierId)?.reviewed;
  const matrix = revisionMatrix(registry, configAt, [
    { stage: "RFQ", found: reference.revision, checkedAt: reference.today },
    {
      stage: "Quotation",
      found:
        approvedQuote?.revision ??
        documents.find((d) => d.id === recommendedId)?.reviewed?.revision,
      checkedAt: lastOf("Buyer validation")?.timestamp ?? null,
      blockerOnMismatch: true,
    },
    {
      stage: "Decision",
      found: lastOf("Decision approval")?.foundRevision,
      checkedAt: lastOf("Decision approval")?.timestamp ?? null,
      blockerOnMismatch: true,
    },
    {
      stage: "PO",
      found: poState.po?.revision,
      checkedAt: lastOf("PO verification")?.timestamp ?? null,
      blockerOnMismatch: true,
    },
    { stage: "Inspection", found: null, checkedAt: null },
  ]);
  const timeline = useMemo(
    () =>
      buildTimeline({
        registry,
        snapshots,
        audit: auditEvents,
        assessments,
        failures: CASES.map((c) => c.failure),
        investigations,
        supplierOf: (id) => rows.find((r) => r.id === id)?.supplier ?? "—",
        partNumber: reference.partNumber || "PN-45Y1258",
      }),
    [registry, snapshots, auditEvents, assessments, investigations, rows, reference.partNumber],
  );
  const publish = (input: { revision: string; effectiveFrom: string; changeReason: string }) => {
    try {
      const next = publishRevision(registry, {
        kind: "drawing",
        documentNumber: DEMO_DRAWING,
        revision: input.revision.trim().toUpperCase(),
        effectiveFrom: input.effectiveFrom,
        owner: "Rafael Lima (Demo engineer)",
        changeReason: input.changeReason,
      });
      setRegistry(next);
      record({
        action: "New revision published",
        details: {
          document: DEMO_DRAWING,
          revision: input.revision,
          effectiveFrom: input.effectiveFrom,
        },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not publish the revision.";
    }
  };
  const assess = (
    alert: (typeof alerts)[number],
    level: ImpactAssessment["level"],
    justification: string,
  ) => {
    try {
      const a = createImpactAssessment(alert, level, justification, actor, poTimestamp());
      setAssessments((xs) => [...xs, a]);
      record({
        action: "Impact assessment recorded",
        justification,
        details: { alert: alert.key, level },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not record the assessment.";
    }
  };
  const confirmInvestigation = (
    failureId: string,
    c: FailureInvestigation["suggested"],
    note: string,
  ) => {
    try {
      setInvestigations((xs) =>
        xs.map((i) =>
          i.failureId === failureId ? confirmClassification(i, c, actor, note) : i,
        ),
      );
      record({
        action: "Investigation concluded",
        justification: note,
        details: { failureId, classification: c },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not confirm the classification.";
    }
  };
  const exportSummary = async (format: "pdf" | "xlsx" | "csv") => {
    try {
      const { buildDecisionSummary } = await import("@/lib/rfq/decision-summary");
      const { exportDecisionSummary } = await import("@/lib/rfq/exports");
      await exportDecisionSummary(
        format,
        buildDecisionSummary({
          reference,
          documents,
          list: results,
          weights,
          approvedDecision,
          poState,
          poApproved: Boolean(poContext),
          snapshots,
          timeline,
        }),
        reference,
      );
      record({
        action: "Decision summary exported",
        details: { source: format === "xlsx" ? "Excel" : format.toUpperCase() },
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not export the summary.");
    }
  };
  const isSampleSet = documents.length > 0 && documents.every((d) => d.id.startsWith("sample-"));
  const stages = workflowStages({
    documents,
    extracting: busy,
    comparisonComputed: results.length > 0,
    recommendationExists: Boolean(recommendedId),
    decisionApproved: Boolean(approvedDecision),
    hasPo: Boolean(poState.po),
    poChecked: Boolean(poState.result),
    poStatus,
    configurationBlocked: gateBlocked(gate),
    revisionMonitoring: alerts.length
      ? alerts.some(
          (al) =>
            assessments.filter((z) => z.alertKey === al.key).at(-1)?.level !== "No known impact",
        )
        ? "In review"
        : "Confirmed"
      : snapshots.length
        ? "Confirmed"
        : "Pending",
    investigationConfirmed: investigations.length > 0 && investigations.every((i) => i.confirmed),
  });
  const pendingBlockers = pendingReviewBlockers(documents, reference);
  const operationInput = scopeSyntheticEvidence({
    reference,
    documents,
    poState,
    configurationBlocked: gateBlocked(gate),
    alerts,
    assessments,
    investigations: documents.length ? investigations : [],
    approved: Boolean(poContext),
  });
  const operationItems = useMemo(
    () => operationalSummary(operationInput),
    [reference, documents, poState, gate, alerts, assessments, investigations, poContext],
  );
  const attentionItems = useMemo(
    () => requiresAttention(operationInput),
    [reference, documents, poState, gate, alerts, assessments, investigations, poContext],
  );
  const searchEntries = useMemo(
    () => buildSearchEntries({ reference, documents, poState, registry }),
    [reference, documents, poState, registry],
  );
  const processSteps = useMemo(
    () =>
      erpProcessSteps({
        setupValid: validReference,
        documents,
        extracting: busy,
        comparisonComputed: results.length > 0,
        decisionApproved: Boolean(approvedDecision),
        hasPo: Boolean(poState.po),
        poIssued: Boolean(
          poState.po &&
          (!poState.lifecycle ||
            (poState.lifecycle.issued && poState.lifecycle.phase !== "Cancelled")),
        ),
        poChecked: Boolean(poState.result),
        poStatus,
        configurationBlocked: gateBlocked(gate),
      }),
    [validReference, documents, busy, results, approvedDecision, poState, poStatus, gate],
  );
  const suggestedStatus = suggestedRfqStatus(processSteps);
  const status: RfqStatus = manualStatus ?? suggestedStatus;
  const statusNote = manualStatus ? rfqStatusMismatch(manualStatus, processSteps) : null;
  const identity = identityLabel(user);
  const hasRfq = workspaceHasRfq({ reference, documents, auditEvents, savedId, unsaved: workspaceUnsaved });
  void pendingBlockers;
  void stages;
  const stepDisabled = (i: number): string | null =>
    i === DASHBOARD_STEP || i >= TRACE_OFFSET
      ? null
      : busy
        ? "Wait for extraction to finish."
        : i === 3 || i === 4
          ? ready
            ? null
            : "Confirm every quotation in Buyer Validation first."
          : i === 5
            ? poContext
              ? null
              : "Record a decision first."
            : null;
  const go = (i: number) => {
    if (poDraftDirty && !window.confirm("Discard unsaved PO draft changes?")) return;
    setPoDraftDirty(false);
    if (i !== step || history) setStep(i);
    setNotice("");
  };
  const allExtracted = documents.length > 0 && documents.every((d) => d.original);
  const continueAction: { label: string; run: () => void; reason: string | null } | null =
    step === 0
      ? {
          label: "Continue to quotes",
          run: () => {
            if (validReference) go(1);
            else {
              setNotice(referenceErrors(reference).join(" "));
              setShowSetupErrors(true);
              const first = firstInvalidField(reference);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>(`[data-setup-field="${first}"][aria-invalid="true"]`)?.focus(),
              );
            }
          },
          reason: null,
        }
      : step === 1
        ? extractQueue(documents).length || !allExtracted
          ? {
              label: busy ? "Extracting quotations…" : "Extract quotations",
              run: () => process(),
              reason: busy
                ? "Extraction in progress."
                : !documents.length
                  ? "Add at least one quote."
                  : documents.some((d) => d.status === "Uploading")
                    ? "Wait for uploads to finish."
                    : null,
            }
          : { label: "Continue to validation", run: () => go(2), reason: null }
        : step === 2
          ? {
              label: "Continue to compare",
              run: () => go(3),
              reason: ready ? null : "Confirm every quotation first.",
            }
          : step === 3
            ? { label: "Continue to decision", run: () => go(4), reason: null }
            : step === 4
              ? {
                  label: "Continue to PO & Release",
                  run: () => go(5),
                  reason: poContext ? null : "Record a decision first.",
                }
              : null;
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "failed"
          ? "Save failed"
          : SAVE_STATUS_LABEL[workspaceStatus];
  const plan = bulkTarget ? bulkConfirmPlan(documents, reference, bulkTarget.id) : null;
  const viewLabel =
    step === 9
      ? "Release Control"
      : step === DASHBOARD_STEP
        ? "Dashboard"
        : (steps[step] ?? "Dashboard");
  const breadcrumb = history
    ? ["RFQ History"]
    : step === DASHBOARD_STEP
      ? ["Dashboard"]
      : [reference.rfqNumber || "New RFQ", viewLabel];
  const newRfq = () => {
    metricInFlight.current = false;
    setAuditEvents([]);
    resetConfiguration();
    setReference({ ...blankRfqReference(), today: localToday() });
    setDraftRestored(false);
    clearDraft(browserStorage());
    setDocuments([]);
    setSavedId(undefined);
    setStep(DASHBOARD_STEP);
    setHistory(false);
    setStatus(null);
    setNotice("");
    reopening.current = true;
    setShowSetupErrors(false);
    setApprovedDecision(undefined);
    setPoState(emptyPoState());
    setSaveState("idle");
    resetBaseline(false);
  };
  const openHistory = () => {
    if (history) setStep(DASHBOARD_STEP);
    else setHistory(true);
    setNotice("");
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface-card focus:p-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 bg-surface-inverse text-text-inverse">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:px-5 md:py-2.5">
          <MobileNav
            current={history ? -2 : step}
            disabled={stepDisabled}
            onSelect={go}
            onHistory={openHistory}
            onNewRfq={newRfq}
            busy={busy}
          />
          <div className="flex min-w-0 items-center gap-2">
            <SaMonogram height={24} />
            <div className="min-w-0">
              <h1 className="truncate text-base font-medium">AeroQuote Compass</h1>
              <Breadcrumb trail={breadcrumb} />
            </div>
          </div>
          <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:flex-1">
            <GlobalSearch
              entries={searchEntries}
              onSearch={(q) => globalSearch(searchEntries, q)}
              onSelect={(entry) => go(entry.step)}
            />
            <Notifications items={attentionItems} onSelect={go} />
            <DemoUser identity={identity} />
          </div>
        </div>
      </header>
      <div className="flex items-start">
        <ErpSidebar
          current={history ? -2 : step}
          disabled={stepDisabled}
          onSelect={go}
          onHistory={openHistory}
          onNewRfq={newRfq}
          busy={busy}
        />
        <div className="min-w-0 flex-1">
          <div role="region" aria-label="Current RFQ" className="border-b border-border-default bg-surface-raised">
            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 sm:px-8">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs">{reference.rfqNumber || "NEW RFQ"}</span>
                <Status>{status}</Status>
                <span
                  role="status"
                  aria-live="polite"
                  className={`text-xs ${saveState === "failed" ? "text-error" : saveState === "saving" ? "text-text-secondary" : workspaceStatus === "unsaved" ? "text-warning" : workspaceStatus === "saved" ? "text-success" : "text-text-secondary"}`}
                >
                  {saveLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="RFQ status"
                  aria-describedby={statusNote ? "rfq-status-note" : undefined}
                  className={`${control} hidden py-1 text-xs sm:block`}
                  value={manualStatus ?? ""}
                  disabled={busy}
                  onChange={(e) => setStatus(e.target.value ? (e.target.value as RfqStatus) : null)}
                >
                  <option value="">Suggested: {suggestedStatus}</option>
                  {(["Draft", "Analyzing", "Under Negotiation", "Awarded", "Completed"] as const).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 md:min-h-8"
                  disabled={saving || busy}
                  onClick={saveCurrent}
                >
                  <Save />
                  {saving ? "Saving…" : "Save RFQ"}
                </Button>
              </div>
            </div>
            {statusNote && (
              <p
                id="rfq-status-note"
                className="mx-auto max-w-7xl border-t border-warning bg-warning-bg px-4 py-1.5 text-xs text-warning sm:px-8"
              >
                {statusNote}
              </p>
            )}
          </div>
          <main
            id="main"
            className="mx-auto max-w-7xl min-w-0 space-y-6 px-4 pb-28 pt-6 sm:px-8 md:space-y-8 md:pb-10 md:pt-8"
          >
            {draftRestored && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-default bg-surface-card px-4 py-2 text-sm"
              >
                <span>Draft restored from this browser.</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Discard the restored draft and start a new RFQ? This cannot be undone.")) newRfq();
                    }}
                  >
                    Discard
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraftRestored(false)}>
                    Keep
                  </Button>
                </div>
              </div>
            )}
            {notice && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-sm border border-border bg-muted px-4 py-3 text-sm"
              >
                {notice}
              </div>
            )}
            {undoDocs && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-success bg-success-bg px-4 py-3 text-sm"
              >
                <span className="text-success">
                  Confirmed {undoDocs.count} reliable {undoDocs.count === 1 ? "field" : "fields"}.
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDocuments(undoDocs.docs);
                      record({ action: "Bulk confirm undone", details: { count: undoDocs.count } });
                      setUndoDocs(null);
                    }}
                  >
                    <Undo2 />
                    Undo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setUndoDocs(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {history ? (
              <History onOpen={open} />
            ) : step === DASHBOARD_STEP ? (
              <DashboardView
                items={operationItems}
                attention={attentionItems}
                onSelect={go}
                reference={reference}
                hasRfq={hasRfq}
                onDemo={() => {
                  go(0);
                  requestAnimationFrame(() => document.getElementById("demo-data")?.scrollIntoView());
                }}
              />
            ) : (
              <>
                <RecordHeader reference={reference} status={status} saveLabel={saveLabel} owner={ownerLabel(user)} />
                {poState.po && (
                  <p className="text-sm text-text-secondary">
                    PO {poState.po.poNumber} · {lifecycleStatus(poState, gateBlocked(gate))}
                  </p>
                )}
                <ProcessStepper steps={processSteps} />
                <div className="min-w-0">
                  <p className="hidden text-xs text-text-secondary md:block">
                    {viewProgressLabel(step, processSteps)}
                  </p>
                  <h2 className="mt-1 break-words text-2xl font-medium tracking-[-0.02em] md:text-4xl">
                    {viewLabel}
                  </h2>
                </div>
                {reference.demoAnalysis && (
                  <p className="text-sm text-text-secondary">
                    Demo analysis date (synthetic): {reference.today}
                  </p>
                )}
                {step === 0 && (
                  <OperationalPanel
                    items={operationalSummary(scopeSyntheticEvidence({
                      reference,
                      documents,
                      poState,
                      configurationBlocked: gateBlocked(gate),
                      alerts,
                      assessments,
                      investigations: documents.length ? investigations : [],
                      approved: Boolean(poContext),
                    }))}
                    onSelect={go}
                  />
                )}
                {step === 0 && (
                  <DemoData
                    hasData={documents.length > 0 || auditEvents.length > 0 || workspaceUnsaved}
                    busy={busy}
                    onClassic={loadSamples}
                    onExtended={loadExtended}
                  />
                )}
                {step === 0 && (
                  <Setup
                    reference={reference}
                    showErrors={showSetupErrors}
                    onChange={(r) => {
                      setReference(r);
                      if (status !== "Draft") setStatus(null);
                    }}
                  />
                )}
                {step === 1 && (
                  <Uploads
                    documents={documents}
                    busy={busy}
                    onFiles={files}
                    onPaste={(text) => {
                      setReference((r) => ({ ...r, ...analysisDateFor(false) }));
                      if (documents.length < MAX_FILES)
                        setDocuments([
                          ...documents,
                          {
                            id: crypto.randomUUID(),
                            text,
                            fileName: `pasted-quote-${documents.length + 1}.txt`,
                            fileType: "txt",
                            status: "Ready",
                            confirmed: false,
                          },
                        ]);
                    }}
                    onRemove={(id) => {
                      setDocuments((ds) => ds.filter((d) => d.id !== id));
                      setStatus(null);
                    }}
                    onProcess={(id) => process(id)}
                    onName={(id, name) => {
                      const d = documents.find((x) => x.id === id);
                      if (d?.reviewed) edit(id, { ...d.reviewed, supplier_name: name });
                    }}
                  />
                )}
                {step === 2 &&
                  isSampleSet &&
                  documents.some((d) => !d.confirmed && !d.excluded) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-default bg-surface-card p-4 text-sm">
                      <p>
                        Demo shortcut: confirm every quotation marked validated in the synthetic
                        catalog. Quotations with missing or low-confidence critical fields stay held
                        for individual buyer validation.
                      </p>
                      <Button size="sm" onClick={validateSamples}>
                        Validate sample quotes (demo)
                      </Button>
                    </div>
                  )}
                {step === 2 && (
                  <Review
                    documents={documents}
                    reference={reference}
                    onEdit={edit}
                    onFieldConfirm={confirmField}
                    onFollowUp={followUp}
                    onAllFollowUp={allFollowUp}
                    onBulkConfirm={(id) => setBulkTarget(id ? { id } : {})}
                    onReset={restoreField}
                    onConfirm={(id) => {
                      const d = documents.find((x) => x.id === id);
                      if (d && !quotationConfirmationErrors(d).length) {
                        patch(id, { confirmed: true, status: "Extracted", excluded: false });
                        const next = documents.map((quote) =>
                          quote.id === id
                            ? {
                                ...quote,
                                confirmed: true,
                                status: "Extracted" as const,
                                excluded: false,
                              }
                            : quote,
                        );
                        if (
                          shouldMeasureBuyerConfirmedRecommendation(
                            next,
                            reference,
                            weights,
                            auditEvents,
                          )
                        ) {
                          window.__lovableEvents?.track?.(
                            "project.rfq_recommended_after_buyer_confirmation",
                            {
                              synthetic: Boolean(reference.demoAnalysis),
                            },
                          );
                          measureBuyerRecommendation(next);
                        }
                        record({
                          action: "Quotation confirmed",
                          documentId: id,
                          newValue: d.reviewed,
                        });
                        snap(
                          "Buyer validation",
                          d.reviewed?.supplier_name ?? d.fileName,
                          d.reviewed?.revision ?? null,
                          d.reviewed?.revision ?? null,
                          { result: "Confirmed", finalStatus: "Buyer validated" },
                        );
                      }
                    }}
                  />
                )}
                {(step === 5 || step === 9) && poContext && (
                  <RevisionStrip
                    registry={registry}
                    snapshots={snapshots}
                    at={configAt}
                    blocked={gateBlocked(gate)}
                  />
                )}
                {(step === 5 || step === 9) && poContext && poState.po && (
                  <GatePanel
                    items={gate}
                    statement={verificationStatement(registry, configAt, configAt)}
                  />
                )}
                {step === 6 && (
                  <ConfigurationPanel
                    registry={registry}
                    snapshots={snapshots}
                    at={configAt}
                    alerts={alerts}
                    assessments={assessments}
                    matrix={matrix}
                    onPublish={publish}
                    onAssess={assess}
                  />
                )}
                {step === 7 && <AuditTrail events={timeline} onExport={exportSummary} />}
                {step === 8 && (
                  <InvestigationPanel
                    cases={CASES}
                    investigations={investigations}
                    onConfirm={confirmInvestigation}
                    demoLoaded={Boolean(reference.demoAnalysis)}
                  />
                )}
                {(step === 5 || step === 9) && (
                  <PoWorkspace
                    state={poState}
                    context={poContext}
                    blocked={gateBlocked(gate)}
                    onTransition={changePoLifecycle}
                    onConfirmation={saveSupplierConfirmation}
                    onError={setNotice}
                    draftDirty={poDraftDirty}
                    onExport={() =>
                      record({
                        action: "PO document exported",
                        details: { poNumber: poState.po?.poNumber, source: "PDF" },
                      })
                    }
                  />
                )}
                {(step === 5 || step === 9) && (
                  <PoPanel
                    configurationBlocked={gateBlocked(gate)}
                    context={poContext}
                    state={poState}
                    onLoad={loadPo}
                    onCheck={checkPo}
                    onResolve={resolvePo}
                    onRelease={releasePo}
                    onDraftDirty={setPoDraftDirty}
                    onEdit={(po) => {
                      try {
                        const next = savePoDraft(poState, po, poTimestamp(), actor);
                        setPoState(next);
                        draftEditAudit(poState.po, po).forEach(record);
                        record(lifecycleAudit("Draft saved", poState, next));
                      } catch (e) {
                        setNotice(e instanceof Error ? e.message : "Could not save the PO draft.");
                      }
                    }}
                    onTolerances={(tolerances) => {
                      setPoState({
                        ...poState,
                        tolerances,
                        ...(poState.lifecycle?.issued
                          ? {
                              lifecycle: {
                                ...poState.lifecycle,
                                phase: "Awaiting verification" as const,
                              },
                            }
                          : {}),
                        result: undefined,
                        resolutions: [],
                        released: false,
                      });
                      record({ action: "PO tolerances changed", details: { tolerances } });
                    }}
                  />
                )}
                {step === 3 && ready && (
                  <ScenarioPanel documents={documents} reference={reference} weights={weights} />
                )}
                {step === 3 && ready && documents.length > 4 && (
                  <QuoteExplorer
                    rows={rows}
                    selected={selected}
                    onSelected={setSelected}
                    onFiltered={setFilteredIds}
                  />
                )}
                {(step === 3 || step === 4) && ready && (
                  <Dashboard
                    view={step === 3 ? "compare" : "decision"}
                    onSummary={exportSummary}
                    selected={selected}
                    onSelected={setSelected}
                    onCompare={() => {
                      go(3);
                      requestAnimationFrame(() => document.getElementById("weight-cost")?.focus());
                    }}
                    filteredIds={step === 3 ? filteredIds : null}
                    list={results}
                    reference={reference}
                    weights={weights}
                    onWeights={(w) => {
                      record({
                        action: "Weights changed",
                        details: { previousWeights: { ...weights }, weights: { ...w } },
                      });
                      setWeights(w);
                    }}
                    approvedDecision={approvedDecision}
                    onRecord={recordDecision}
                  />
                )}
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface-raised px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
                  <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                    <Button
                      variant="outline"
                      className="min-h-11 md:min-h-9"
                      disabled={busy}
                      onClick={() => go(step >= TRACE_OFFSET ? 5 : step - 1)}
                    >
                      <ArrowLeft />
                      Back
                    </Button>
                    <div className="flex min-w-0 items-center justify-end gap-3">
                      {step === 2 && (
                        <span className="hidden text-xs text-text-secondary sm:inline">
                          {documents.filter((d) => d.confirmed).length} / {documents.length}{" "}
                          quotations confirmed
                        </span>
                      )}
                      {continueAction && continueAction.reason && (
                        <span
                          id="continue-reason"
                          className="hidden min-w-0 text-xs text-text-secondary sm:inline"
                        >
                          {continueAction.reason}
                        </span>
                      )}
                      {continueAction && (
                        <Button
                          className="min-h-11 min-w-0 md:min-h-9"
                          aria-describedby={continueAction.reason ? "continue-reason" : undefined}
                          disabled={Boolean(continueAction.reason)}
                          title={continueAction.reason ?? undefined}
                          onClick={continueAction.run}
                        >
                          <span className="truncate">{continueAction.label}</span>
                          <ArrowRight />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <BulkConfirmDialog
                  plan={plan}
                  scopeLabel={bulkTarget?.id ? "This quotation" : "All quotations"}
                  onCancel={() => setBulkTarget(null)}
                  onConfirm={() => {
                    bulkConfirm(bulkTarget?.id);
                    setBulkTarget(null);
                  }}
                />
              </>
            )}
          </main>
        </div>
      </div>
      <footer className="border-t border-border-default">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <SaMonogram color="#0B302B" height={20} />
            <span className="font-serif text-lg font-light">Stephany Alves</span>
            <span aria-hidden="true" className="h-5 w-px bg-border-strong/40" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
              Signal &amp; Structure
            </span>
          </div>
          <div className="space-y-1 text-xs text-text-tertiary sm:text-right">
            <p className="font-medium text-foreground">AI extracts. Code calculates. You decide.</p>
            <p>Synthetic sample data for portfolio purposes. No real company data.</p>
            <p className="font-serif text-sm italic">Complexity, made clear.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
