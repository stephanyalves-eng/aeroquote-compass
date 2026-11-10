import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Section, Field, control } from "./primitives";
import { Tag } from "./tone";
import { CLASSIFICATION_HELP, type FailureClassification, type FailureInvestigation } from "@/lib/rfq/investigation";
import type { InvestigationCase } from "@/lib/rfq/investigation-demo";
export function InvestigationPanel({ cases, investigations, onConfirm, demoLoaded = true }: { cases: InvestigationCase[]; investigations: FailureInvestigation[]; onConfirm: (failureId: string, c: FailureClassification, note: string) => string | null; demoLoaded?: boolean }) {
  const [choice, setChoice] = useState<Record<string, { c?: FailureClassification; note: string }>>({}), [error, setError] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  if (!demoLoaded && !showDemo) return <section aria-labelledby="no-investigations" className="space-y-3 rounded-md border border-border-default bg-surface-card p-5">
    <h3 id="no-investigations" className="text-lg font-medium">No investigations for this RFQ</h3>
    <p className="text-sm text-text-secondary">No inspection failures have been recorded against this RFQ. You can explore how investigations work with synthetic demo cases; they are not part of this RFQ.</p>
    <Button variant="outline" onClick={() => setShowDemo(true)}>View synthetic demo cases</Button>
  </section>;
  return <div className="space-y-6">
    {!demoLoaded && <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-default bg-surface-sunken px-4 py-3 text-sm"><span><Tag tone="neutral">Synthetic demo</Tag> These cases are illustrations, not investigations of this RFQ.</span><Button size="sm" variant="ghost" onClick={() => setShowDemo(false)}>Hide demo cases</Button></div>}
    <p className="text-sm text-text-secondary">Synthetic inspection failures compared with immutable verification snapshots. The system suggests a classification and shows its evidence; it never assigns blame. The buyer must confirm.</p>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    {cases.map((k) => { const inv = investigations.find((i) => i.failureId === k.failure.id)!; const f = k.failure, form = choice[f.id] ?? { note: "" }, selected = form.c ?? inv.suggested;
      return <Section key={k.id} title={k.title} subtitle={`${f.type} · ${f.date} · ${f.supplier} · ${f.poNumber} · lot ${f.lot}`}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-text-tertiary">Description</dt><dd>{f.description}</dd></div><div><dt className="text-text-tertiary">Revision found on part / in force at manufacture</dt><dd className="font-mono">Rev {f.revisionFound ?? "Not provided"} / Rev {inv.revisionAtManufacture ?? "Not provided"}</dd></div><div><dt className="text-text-tertiary">Impact</dt><dd>{f.impact}</dd></div></dl>
        <div className="text-sm"><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Evidence used</p><ul className="mt-1 list-disc pl-5">{[...inv.evidence, ...f.evidence.map((e) => `Synthetic evidence: ${e}`)].map((e) => <li key={e}>{e}</li>)}</ul></div>
        <p className="text-sm">Suggested classification: <Tag tone={inv.suggested.startsWith("Process") ? "success" : inv.suggested.startsWith("Insufficient") ? "neutral" : "warning"}>{inv.suggested}</Tag> <span className="text-text-tertiary">{CLASSIFICATION_HELP[inv.suggested]}</span></p>
        {inv.confirmed ? <p className="text-sm text-success">Confirmed by {inv.confirmedBy}: {inv.confirmed}{inv.note ? ` — ${inv.note}` : ""}</p> :
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><Field label="Classification to confirm"><select className={control} value={selected} onChange={(e) => setChoice({ ...choice, [f.id]: { ...form, c: e.target.value as FailureClassification } })}>{(Object.keys(CLASSIFICATION_HELP) as FailureClassification[]).map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label={selected === inv.suggested ? "Note (optional)" : "Reason for differing from the suggestion (required)"}><input className={control} value={form.note} onChange={(e) => setChoice({ ...choice, [f.id]: { ...form, note: e.target.value } })} /></Field>
          <Button onClick={() => setError(onConfirm(f.id, selected, form.note) ?? "")}>Confirm classification</Button></div>}
      </Section>; })}
  </div>;
}
