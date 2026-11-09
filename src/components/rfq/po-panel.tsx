import { useEffect, useState } from "react";
import {
  draftErrors,
  poEditingAllowed,
  poVerificationAllowed,
  poReleaseAllowed,
} from "@/lib/rfq/po-lifecycle";
import { Check, FilePlus, ClipboardCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  PO_FIELDS,
  PO_TOLERANCE_FIELDS,
  poSummary,
  purchaseOrderStatus,
  toleranceErrors,
} from "@/lib/rfq/po-check";
import { PO_SCENARIOS, type PoScenario } from "@/lib/rfq/po-samples";
import type {
  ApprovedPoContext,
  PurchaseOrder,
  PoState,
  PoTolerances,
  PoResolution,
  PoCheckItem,
} from "@/lib/rfq/po-types";
import { poProgress } from "@/lib/rfq/presentation";
import { Section, Field, control } from "./primitives";
const value = (v: unknown): string =>
  v == null || v === ""
    ? "Not provided"
    : Array.isArray(v)
      ? v.join("; ") || "Not provided"
      : typeof v === "number"
        ? v.toLocaleString("en-US", { maximumFractionDigits: 4 })
        : String(v);
export function PoStatusBadge({
  text,
  blocker = false,
  review = false,
  confirmed = false,
}: {
  text: string;
  blocker?: boolean;
  review?: boolean;
  confirmed?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-sm border px-2 py-1 font-mono text-[11px] uppercase ${blocker ? "border-error bg-error-bg text-error" : review ? "border-border-default bg-warning-bg text-warning" : confirmed ? "border-border-default bg-success-bg text-success" : "border-border-default bg-surface-sunken text-text-secondary"}`}
    >
      {text}
    </span>
  );
}
interface Props {
  configurationBlocked?: boolean;
  context: ApprovedPoContext | null;
  state: PoState;
  onLoad: (scenario: PoScenario | "Created from approval") => void;
  onEdit: (po: PurchaseOrder) => void;
  onCheck: () => void;
  onTolerances: (t: PoTolerances) => void;
  onResolve: (id: string, action: PoResolution["action"], justification: string) => void;
  onRelease: () => void;
  onDraftDirty: (dirty: boolean) => void;
}
export function PoPanel({
  context,
  state,
  onLoad,
  onEdit,
  onCheck,
  onTolerances,
  onResolve,
  onRelease,
  onDraftDirty,
  configurationBlocked = false,
}: Props) {
  const [scenario, setScenario] = useState<PoScenario>("Correct PO"),
    [accept, setAccept] = useState<PoCheckItem | null>(null),
    [justification, setJustification] = useState(""),
    [attempted, setAttempted] = useState(false);
  const summary = poSummary(state.result, state.resolutions),
    status = purchaseOrderStatus(state, Boolean(context));
  const errors = toleranceErrors(state.tolerances);
  const po = state.po;
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [draftAttempted, setDraftAttempted] = useState(false);
  useEffect(() => {
    setDraft(po ? structuredClone(po) : null);
    setDraftAttempted(false);
  }, [po]);
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(po));
  const editing = poEditingAllowed(state);
  const editPo = state.lifecycle ? draft : po;
  const changeDraft = (next: PurchaseOrder) => (state.lifecycle ? setDraft(next) : onEdit(next));
  const draftValidation = draft ? draftErrors(draft) : [];
  useEffect(() => { onDraftDirty(dirty); }, [dirty, onDraftDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!context)
    return (
      <Section title="Purchase Order Check">
        <p className="text-warning">Awaiting approved decision</p>
        <PoStatusBadge text="Awaiting PO" />
        <p className="text-sm text-text-secondary">
          Record a valid sourcing decision before checking a purchase order.
        </p>
      </Section>
    );
  const item = (i: PoCheckItem) => {
    const resolution = state.resolutions.find(
      (r) => r.itemId === i.id && r.fingerprint === i.fingerprint,
    );
    return (
      <details key={i.id} className="po-check-item border-b border-border-subtle py-3">
        <summary className="cursor-pointer">
          <span className="inline-flex w-full flex-wrap items-center justify-between gap-3">
            <span className="font-medium">{i.fieldLabel}</span>
            <PoStatusBadge
              text={
                summary.resolved(i)
                  ? "Accepted with justification"
                  : i.status === "requires_review"
                    ? "Requires review"
                    : i.status === "not_applicable"
                      ? "Not applicable"
                      : i.status === "blocker"
                        ? "Blocker"
                        : "Confirmed"
              }
              blocker={i.status === "blocker"}
              review={i.status === "requires_review" && !summary.resolved(i)}
              confirmed={i.status === "confirmed" || summary.resolved(i)}
            />
          </span>
        </summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Approved value", value(i.approvedValue)],
            ["PO value", value(i.poValue)],
            ["Absolute difference", value(i.absoluteDifference)],
            [
              "Difference (%)",
              i.percentDifference == null ? "Not applicable" : `${i.percentDifference.toFixed(3)}%`,
            ],
            [
              "Financial impact (USD)",
              i.financialImpactUsd == null
                ? "Not assessed"
                : `USD ${i.financialImpactUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            ],
            ["Reference source", i.referenceSource],
            ["Severity", i.severity],
          ].map(([label, v]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-text-tertiary">{label}</dt>
              <dd className="mt-1 break-words tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm">{i.note}</p>
        <p className="mt-2 text-sm text-text-secondary">{i.recommendedAction}</p>
        {resolution && (
          <p className="mt-3 text-sm text-text-secondary">
            {resolution.action === "accepted" ? "Accepted" : "Correction requested"} ·{" "}
            {resolution.actor} ·{" "}
            {resolution.justification || "Corrected PO requested from supplier/requester."}
          </p>
        )}
        {(i.status === "blocker" || i.status === "requires_review") && (
          <div className="mt-4 flex flex-wrap gap-2">
            {i.status !== "blocker" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAccept(i);
                  setJustification("");
                  setAttempted(false);
                }}
              >
                Accept with justification
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(i.id, "correction_requested", "")}
            >
              Request correction
            </Button>
          </div>
        )}
      </details>
    );
  };
  return (
    <div className="space-y-6">
      <Section
        title="Purchase Order Check"
        subtitle={context.decision.supplier}
        action={
          <PoStatusBadge
            text={status}
            blocker={status === "PO blocked"}
            review={status === "PO with discrepancies"}
            confirmed={status === "PO checked and released"}
          />
        }
      >
        <ol
          aria-label="Purchase release progress"
          className="grid gap-3 md:grid-cols-4 xl:grid-cols-7"
        >
          {poProgress(state, Boolean(context), configurationBlocked).map((stage, index) => (
            <li key={stage.label} className="min-w-0 border-l-2 border-border-default pl-3 text-sm">
              <span className="text-xs text-text-secondary">
                {index + 1} · {stage.status}
              </span>
              <p
                className={
                  stage.status === "Complete"
                    ? "font-medium text-success"
                    : stage.status === "Blocked"
                      ? "font-medium text-error"
                      : "font-medium"
                }
              >
                {stage.label}
              </p>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 md:flex md:flex-wrap md:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Load demo PO">
              <select
                aria-label="Load demo PO"
                className={control}
                value={scenario}
                onChange={(e) => setScenario(e.target.value as PoScenario)}
              >
                {PO_SCENARIOS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved PO draft changes?")) onLoad(scenario);
            }}
          >
            <FilePlus />
            Load demo PO
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved PO draft changes?"))
                onLoad("Created from approval");
            }}
          >
            <FilePlus />
            Create PO from approved decision
          </Button>
        </div>
        {po?.synthetic && (
          <p className="text-sm text-text-secondary">Synthetic demo PO — fictitious data</p>
        )}
        {po ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-text-tertiary">PO number</p>
                <p className="mt-1 font-medium">{po.poNumber || "Not provided"}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Supplier</p>
                <p className="mt-1 font-medium">{po.supplier || "Not provided"}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                ["Confirmed checks", summary.confirmed],
                ["Discrepancies", summary.discrepancies],
                ["Missing fields", summary.missing],
                ["Blockers", summary.blockers],
              ].map(([label, v]) => (
                <div key={label}>
                  <dt className="font-mono text-[11px] uppercase text-text-tertiary">{label}</dt>
                  <dd className="mt-1 text-2xl tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-sm text-text-secondary">No purchase order loaded.</p>
        )}
        <details>
          <summary className="cursor-pointer font-medium">Tolerance settings</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PO_TOLERANCE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex items-center gap-2">
                  <input
                    className={control}
                    type="number"
                    min="0"
                    step="any"
                    value={Number.isFinite(state.tolerances[f.key]) ? state.tolerances[f.key] : ""}
                    onChange={(e) =>
                      onTolerances({
                        ...state.tolerances,
                        [f.key]: e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                  />
                  <span tabIndex={0} title={f.explanation} aria-label={f.explanation}>
                    <Info size={16} strokeWidth={1.5} />
                  </span>
                </div>
              </Field>
            ))}
          </div>
          <p className="mt-4 text-sm text-text-secondary">
            Within tolerance is confirmed with a note. Beyond tolerance, mandatory controls block
            release; other differences require buyer review.
          </p>
        </details>
        <p className="text-xs text-text-tertiary">
          Tolerances used:{" "}
          {PO_TOLERANCE_FIELDS.map(
            (f) =>
              `${f.label}: ${value(state.result?.tolerances[f.key] ?? state.tolerances[f.key])}`,
          ).join(" · ")}
        </p>
        {errors.length > 0 && (
          <ul role="alert" className="text-sm text-error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {state.result && (
          <>
            <div>
              <h3 className="font-medium">Blockers and discrepancies</h3>
              {state.result.items
                .filter((i) => i.status === "blocker" || i.status === "requires_review")
                .map(item)}
              {!state.result.items.some(
                (i) => i.status === "blocker" || i.status === "requires_review",
              ) && <p className="mt-3 text-sm text-success">No blockers or discrepancies.</p>}
            </div>
            <details>
              <summary className="cursor-pointer font-medium">
                Show confirmed checks ({summary.confirmed})
              </summary>
              {state.result.items
                .filter((i) => i.status === "confirmed" || i.status === "not_applicable")
                .map(item)}
            </details>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!po || errors.length > 0 || !poVerificationAllowed(state) || dirty}
            onClick={onCheck}
          >
            <ClipboardCheck />
            Check purchase order
          </Button>
          <Button
            disabled={!poReleaseAllowed(state, Boolean(context), configurationBlocked) || dirty}
            onClick={onRelease}
          >
            <Check />
            Release purchase
          </Button>
          {state.result &&
            summary.canRelease &&
            !state.released &&
            (configurationBlocked ? (
              <p className="text-sm text-error">
                Blocked: resolve the configuration review blockers above before release.
              </p>
            ) : (
              <p className="text-sm text-success">{poReleaseAllowed(state, Boolean(context), configurationBlocked) ? "Checks complete; buyer release is available." : "Checks complete. Confirm verification and prepare release in the PO workflow."}</p>
            ))}
        </div>
      </Section>
      {editPo && editing && (
        <details className="border-t border-border-default pt-4">
          <summary className="cursor-pointer text-lg font-medium">Edit purchase order</summary>
          {state.lifecycle && (
            <>
              <p role="status" className="mt-3 text-sm text-text-secondary">
                {dirty ? "Unsaved draft changes" : "Draft saved"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!dirty}
                  onClick={() => {
                    setDraftAttempted(true);
                    if (draft && !draftValidation.length) onEdit(draft);
                  }}
                >
                  Save PO draft
                </Button>
                <Button
                  variant="outline"
                  disabled={!dirty}
                  onClick={() => {
                    if (window.confirm("Discard unsaved PO draft changes?")) {
                      setDraft(po ? structuredClone(po) : null);
                      setDraftAttempted(false);
                    }
                  }}
                >
                  Discard changes
                </Button>
              </div>
              {draftAttempted && draftValidation.length > 0 && (
                <ul role="alert" className="mt-3 text-sm text-error">
                  {draftValidation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PO_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.kind === "currency" ? (
                  <select
                    className={control}
                    value={editPo.currency ?? ""}
                    onChange={(e) =>
                      changeDraft({
                        ...editPo,
                        currency: e.target.value
                          ? (e.target.value as PurchaseOrder["currency"])
                          : null,
                      })
                    }
                  >
                    <option value="">Not provided</option>
                    {["USD", "EUR", "BRL"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : f.kind === "list" ? (
                  <textarea
                    className={control}
                    rows={3}
                    value={(editPo[f.key] as string[]).join("; ")}
                    onChange={(e) =>
                      changeDraft({
                        ...editPo,
                        [f.key]: e.target.value
                          .split(";")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                ) : (
                  <input
                    className={control}
                    type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                    min={f.kind === "number" ? 0 : undefined}
                    step="any"
                    value={editPo[f.key] == null ? "" : String(editPo[f.key])}
                    onChange={(e) =>
                      changeDraft({
                        ...editPo,
                        [f.key]:
                          f.kind === "number"
                            ? e.target.value === ""
                              ? null
                              : Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </details>
      )}
      {po && !editing && (
        <p className="border-l-2 border-border-brand pl-3 text-sm text-text-secondary">
          Issued document locked. Create an amendment to change this PO.
        </p>
      )}
      <Dialog
        open={Boolean(accept)}
        onOpenChange={(open) => {
          if (!open) {
            if (justification.trim() && !window.confirm("Discard the unsaved justification?"))
              return;
            setAccept(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] rounded-md">
          <DialogTitle>Accept discrepancy with justification</DialogTitle>
          <DialogDescription>
            {accept?.fieldLabel} · Marina Costa (Demo buyer). This does not alter the purchase
            order.
          </DialogDescription>
          <Field label="Buyer justification">
            <textarea
              className={control}
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </Field>
          {attempted && !justification.trim() && (
            <p role="alert" className="text-sm text-error">
              A written justification is required.
            </p>
          )}
          <Button
            onClick={() => {
              setAttempted(true);
              if (accept && justification.trim()) {
                onResolve(accept.id, "accepted", justification);
                setAccept(null);
              }
            }}
          >
            Accept discrepancy
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
