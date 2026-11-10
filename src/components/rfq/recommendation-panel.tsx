import { DEMO_AUDIT_ACTOR } from "@/lib/rfq/identity";
import { useRef, useState } from "react";
import { Check, Info, FileText, ArrowRight, SlidersHorizontal, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  explainRecommendation,
  decisionErrors,
  REASON_LABELS,
  ROBUSTNESS_TOOLTIP,
  type ApprovedDecision,
} from "@/lib/rfq/recommendation";
import { ELIGIBILITY_LABELS } from "@/lib/rfq/eligibility";
import type { EligibilityStatus } from "@/lib/rfq/review-types";
import type { Intelligence, Weights } from "@/lib/rfq/intelligence";
import type { RfqReference } from "@/lib/rfq/types";
import { Section, Money, Field, control } from "./primitives";
import { LandedBreakdown, LandedDiff } from "./landed-breakdown";
export function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  return (
    <span
      className={`inline-flex rounded-sm border px-2 py-1 font-mono text-[11px] uppercase ${status === "not_eligible" ? "border-error bg-error-bg text-error" : status === "awaiting_review" ? "border-border-default bg-warning-bg text-warning-tag" : "border-border-default bg-success-bg text-success-tag"}`}
    >
      {ELIGIBILITY_LABELS[status]}
    </span>
  );
}
export function RecommendationPanel({
  list,
  reference,
  weights,
  approvedDecision,
  onRecord,
  onCalculation,
  onExport,
  onChangeWeights,
  actor,
}: {
  actor?: string;
  list: Intelligence[];
  reference: RfqReference;
  weights: Weights;
  approvedDecision?: ApprovedDecision | undefined;
  onRecord: (id: string, justification: string) => void;
  onCalculation: (id: string) => void;
  onExport: () => void;
  onChangeWeights: () => void;
}) {
  const explanation = explainRecommendation(list, reference, weights),
    r = explanation.recommended;
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [justification, setJustification] = useState(""),
    [attempted, setAttempted] = useState(false),
    [otherId, setOtherId] = useState("");
  const decisionTrigger = useRef<HTMLButtonElement>(null);
  const other = list.find((a) => a.document.id === otherId);
  const errors = decisionErrors(list, r, selected, justification, weights);
  return (
    <Section title="Procurement Recommendation">
      <div className="bg-surface-inverse p-6 text-text-inverse">
        <p className="font-mono text-[11px] uppercase text-text-inverse/70">Recommended supplier</p>
        <h3 className="mt-2 text-2xl font-medium">{r?.name ?? "No eligible supplier"}</h3>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Lead time",
              r?.baseline.quote.lead_time_days == null
                ? "Not provided"
                : `${r.baseline.quote.lead_time_days} days`,
            ],
            ["Annual total landed cost", <Money value={explanation.annualLanded} />],
            [
              "Savings vs current supplier",
              <>
                <Money value={explanation.incumbentSavings} />
                {explanation.incumbentPercent != null &&
                  ` (${explanation.incumbentPercent.toFixed(1)}%)`}
              </>,
            ],
            [
              "Savings vs next eligible alternative",
              <>
                <Money value={explanation.nextSavings} />
                {explanation.nextPercent != null && ` (${explanation.nextPercent.toFixed(1)}%)`}
                <span className="block text-xs text-text-inverse/70">
                  {explanation.next?.name ?? "No eligible alternative"}
                </span>
              </>,
            ],
            ["Final score", r?.score == null ? "Not provided" : `${r.score.toFixed(1)} / 100`],
            ["Risk level", r?.risk ?? "Not provided"],
            [
              "Eligibility",
              explanation.eligibility ? (
                <EligibilityBadge status={explanation.eligibility.status} />
              ) : (
                "No eligible supplier"
              ),
            ],
          ].map(([label, v], i) => (
            <div key={i}>
              <p className="font-mono text-[11px] uppercase text-text-inverse/70">{label}</p>
              <p className="mt-2 tabular-nums">{v}</p>
            </div>
          ))}
          <div>
            <p className="font-mono text-[11px] uppercase text-text-inverse/70">Robustness</p>
            <p className="mt-2 flex items-center gap-2">
              {r ? explanation.robustness : "Not assessed"}
              <button type="button" className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring" title={ROBUSTNESS_TOOLTIP} aria-label={`How robustness is assessed: ${ROBUSTNESS_TOOLTIP}`}>
                <Info size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </p>
          </div>
        </div>
      </div>
      <details open>
        <summary className="cursor-pointer font-medium">Why this supplier won</summary>
        <ul className="mt-4 space-y-3 text-sm">
          {explanation.winFactors.length ? (
            explanation.winFactors.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} />
                <span>{f}</span>
              </li>
            ))
          ) : (
            <li>Resolve blockers and confirm quotations before a recommendation can be made.</li>
          )}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          Risks and points of attention ({explanation.risks.length})
        </summary>
        <ul className="mt-4 space-y-2 text-sm text-warning">
          {explanation.risks.length ? (
            explanation.risks.map((s) => <li key={s}>{s}</li>)
          ) : (
            <li className="text-text-secondary">No non-blocking risks identified.</li>
          )}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          Why the other suppliers did not win
        </summary>
        <div className="mt-4 divide-y divide-border-subtle">
          {explanation.perSupplier.map(({ supplier, eligibility, reasons }) => (
            <div key={supplier.document.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{supplier.name}</h4>
                <EligibilityBadge status={eligibility.status} />
              </div>
              <ul className="space-y-2 text-sm">
                {reasons.length ? (
                  reasons.map((x, i) => (
                    <li key={i}>
                      <span
                        className={`font-medium ${x.category === "disqualified_by_blocker" || x.category === "expired_quote" || x.category === "missing_certification_or_requirement" ? "text-error" : x.category === "relevant_risk" ? "text-warning" : "text-text-secondary"}`}
                      >
                        {REASON_LABELS[x.category]}:{" "}
                      </span>
                      {x.text}
                    </li>
                  ))
                ) : (
                  <li className="text-text-tertiary">
                    No award recommendation is available with the current weights.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </details>
      <details id="recommendation-calculation">
        <summary className="min-h-11 cursor-pointer font-medium">Calculation details</summary>
        {r ? (
          <div className="mt-4">
            <LandedBreakdown supplier={r} reference={reference} />
          </div>
        ) : (
          <p className="mt-4 text-sm">Not yet calculated.</p>
        )}
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer font-medium">
          Alternatives ({list.filter((a) => a.eligible && a !== r).length})
        </summary>
        <div className="mt-4 divide-y divide-border-subtle">
          {list
            .filter((a) => a.eligible && a !== r)
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
            .map((a) => (
              <div key={a.document.id} className="space-y-2 py-4">
                <h4 className="font-medium">{a.name}</h4>
                <p className="text-sm">
                  <Money value={a.annualLanded} /> annual · {a.score?.toFixed(1) ?? "Not provided"}{" "}
                  / 100 · {a.risk} risk
                </p>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setOtherId(a.document.id)}
                >
                  Compare alternative
                </Button>
              </div>
            ))}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!r}
          onClick={() => {
            const details = document.getElementById("recommendation-calculation");
            if (details instanceof HTMLDetailsElement) {
              details.open = true;
              details.scrollIntoView({ block: "start" });
            }
            if (r) onCalculation(r.document.id);
          }}
        >
          <FileText />
          View full calculation
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!r || list.length < 2}
          onClick={() => {
            const alt = list.find((a) => a !== r);
            setOtherId(alt?.document.id ?? "");
            requestAnimationFrame(() => document.getElementById("cost-compare-picker")?.focus());
          }}
        >
          <ArrowRight />
          Compare with another supplier
        </Button>
        <Button variant="outline" size="sm" onClick={onChangeWeights}>
          <SlidersHorizontal />
          Change weights
        </Button>
        <Button
          ref={decisionTrigger}
          size="sm"
          disabled={!r}
          onClick={() => {
            setSelected(approvedDecision?.supplierId ?? r?.document.id ?? "");
            setJustification(approvedDecision?.justification ?? "");
            setAttempted(false);
            setOpen(true);
          }}
        >
          <Check />
          Record decision
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download />
          Export summary
        </Button>
      </div>
      {approvedDecision && (
        <p role="status" className="text-sm text-success">
          Decision recorded: {approvedDecision.supplier}
          {approvedDecision.override ? " (override)" : ""} · {approvedDecision.actor} ·{" "}
          {approvedDecision.timestamp}
          {approvedDecision.justification && ` · ${approvedDecision.justification}`}. Purchase order
          checking is available.
        </p>
      )}
      {r && otherId && (
        <div className="space-y-4 border-t border-border-subtle pt-4">
          <Field label="Compare annual cost components with">
            <select
              id="cost-compare-picker"
              className={control}
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
            >
              {list
                .filter((a) => a !== r)
                .map((a) => (
                  <option key={a.document.id} value={a.document.id}>
                    {a.name}
                    {!a.eligible ? " · Not eligible" : ""}
                  </option>
                ))}
            </select>
          </Field>
          {other && <LandedDiff left={r} right={other} reference={reference} />}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (
            !next &&
            justification.trim() &&
            !window.confirm("Discard the unsaved justification?")
          )
            return;
          setOpen(next);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            decisionTrigger.current?.focus();
          }}
          className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-md"
        >
          <DialogTitle>Record sourcing decision</DialogTitle>
          <DialogDescription>
            Approval recorded as {actor ?? DEMO_AUDIT_ACTOR}. Only buyer-confirmed eligible suppliers may
            be selected.
          </DialogDescription>
          <Field label="Approved supplier">
            <select
              className={control}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {list.map((a) => (
                <option key={a.document.id} value={a.document.id} disabled={!a.eligible}>
                  {a.name}
                  {!a.eligible ? " · Not eligible" : a === r ? " · Recommended" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={
              selected !== r?.document.id
                ? "Override justification (at least 20 characters)"
                : "Decision note (optional)"
            }
          >
            <textarea
              className={control}
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </Field>
          {attempted && errors.length > 0 && (
            <ul role="alert" className="space-y-2 text-sm text-error">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (justification.trim() && !window.confirm("Discard the unsaved justification?"))
                  return;
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAttempted(true);
                if (!errors.length) {
                  onRecord(selected, justification);
                  setOpen(false);
                }
              }}
            >
              Approve decision
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
