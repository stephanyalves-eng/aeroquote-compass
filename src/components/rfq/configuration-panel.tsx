import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Field, control } from "./primitives";
import { Tag, toneFor, th, td } from "./tone";
import { DOCUMENT_KIND_LABELS, IMPACT_LEVELS, DEMO_DRAWING, currentRevision, unresolvedRevisionAlerts, type ConfigurationSnapshot, type DocumentRevision, type ImpactAssessment, type ImpactLevel, type MatrixRow, type RevisionAlert, type ConfigurationGateItem } from "@/lib/rfq/revisions";

export const TERMS: Record<string, string> = {
  "Drawing revision": "The engineering revision letter of the drawing that defines the part.",
  "Buyer validation": "The buyer confirms the AI-extracted quotation values are accurate.",
  "PO verification": "Check of the purchase order against the approved decision and current documents.",
  "Configuration review": "Assessment of whether a document change affects quotations, decisions or POs.",
};
export function Term({ name }: { name: keyof typeof TERMS }) { return <abbr title={TERMS[name]} className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline">{name}</abbr>; }

/** Compact strip: current revision, revision used in the last check, check date and documentation state. */
export function RevisionStrip({ registry, snapshots, at, blocked }: { registry: DocumentRevision[]; snapshots: readonly ConfigurationSnapshot[]; at: string; blocked: boolean }) {
  const cur = currentRevision(registry, "drawing", DEMO_DRAWING, at), last = [...snapshots].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const state = blocked ? "Re-evaluation required" : last && last.drawingRevision !== cur?.revision ? "New revision detected" : "Documentation current";
  return <dl className="grid gap-3 rounded-sm border border-border-default bg-surface-card p-4 text-sm md:grid-cols-4">
    <div><dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary"><Term name="Drawing revision" /> (current)</dt><dd className="mt-1 font-mono">{DEMO_DRAWING} Rev {cur?.revision ?? "Not provided"}</dd></div>
    <div><dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Revision used in last check</dt><dd className="mt-1 font-mono">{last?.drawingRevision ? `Rev ${last.drawingRevision} · ${last.checkType}` : "No check yet"}</dd></div>
    <div><dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Last check date</dt><dd className="mt-1">{last ? last.timestamp.slice(0, 10) : "—"}</dd></div>
    <div><dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">Documentation state</dt><dd className="mt-1"><Tag tone={toneFor(state)}>{state}</Tag></dd></div>
  </dl>;
}

export function GatePanel({ items, statement }: { items: ConfigurationGateItem[]; statement: string | null }) {
  const blocked = items.some((i) => i.status === "blocker");
  return <Section title="Configuration review before release" subtitle="Last documentary barrier before manufacturing. Revision, supplier, part number and superseded documents never accept tolerances.">
    <div className="mobile-data-table"><table className="w-full min-w-[640px] text-sm"><thead><tr>{["Control", "Expected", "Found", "Status", "Reason"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{items.map((i) => <tr key={i.id}><td data-label="Control" className={td}>{i.label}</td><td data-label="Expected value" className={`${td} font-mono text-xs`}>{i.expected}</td><td data-label="Found value" className={`${td} font-mono text-xs`}>{i.found}</td><td data-label="Status" className={td}><Tag tone={i.status === "blocker" ? "error" : i.status === "requires_review" ? "warning" : "success"}>{i.status === "blocker" ? "Blocker" : i.status === "requires_review" ? "Requires review" : "Confirmed"}</Tag></td><td data-label="Reason / next action" className={td}>{i.reason}</td></tr>)}</tbody></table></div>
    <p className={`text-sm ${blocked ? "text-error" : "text-success"}`}>{blocked ? "PO blocked by revision or traceability control. Request a corrected PO or complete the configuration review; nothing is corrected automatically." : statement}</p>
  </Section>;
}

export function ConfigurationPanel({ registry, snapshots, at, alerts, assessments, matrix, onPublish, onAssess }: { registry: DocumentRevision[]; snapshots: readonly ConfigurationSnapshot[]; at: string; alerts: RevisionAlert[]; assessments: ImpactAssessment[]; matrix: MatrixRow[];
  onPublish: (input: { revision: string; effectiveFrom: string; changeReason: string }) => string | null; onAssess: (alert: RevisionAlert, level: ImpactLevel, justification: string) => string | null }) {
  const [pub, setPub] = useState({ revision: "D", effectiveFrom: at, changeReason: "Port thread changed to MJ12." }), [error, setError] = useState("");
  const [assess, setAssess] = useState<Record<string, { level: ImpactLevel; justification: string }>>({});
  const open = unresolvedRevisionAlerts(alerts, assessments);
  return <div className="space-y-6">
    <RevisionStrip registry={registry} snapshots={snapshots} at={at} blocked={open.length > 0} />
    {alerts.length === 0 ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Info className="size-4" strokeWidth={1.5} />No new revision since the recorded checks.</p> : alerts.map((a) => { const cur = assessments.filter((x) => x.alertKey === a.key).at(-1), form = assess[a.key] ?? { level: "Requires analysis" as ImpactLevel, justification: "" };
      return <section key={a.key} role="alert" className={`space-y-3 rounded-sm border p-4 ${cur?.level === "No known impact" ? "border-border-default" : "border-warning bg-warning-bg"}`}>
        <p className="flex items-center gap-2 font-medium text-warning"><AlertTriangle className="size-4" strokeWidth={1.5} />New revision detected</p><p className="text-sm">{a.message}</p>
        <p className="text-xs text-text-secondary">Document {a.documentNumber} · Rev {a.previousRevision} → Rev {a.newRevision} · changed {a.changedOn} · affected stages: {a.affectedStages.join(", ")} · {a.affectedChecks.length} check(s) against the previous revision</p>
        {cur && <p className="text-sm">Latest <Term name="Configuration review" />: <Tag tone={toneFor(cur.level)}>{cur.level}</Tag> — {cur.justification} ({cur.actor})</p>}
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end"><Field label="Impact assessment"><select className={control} value={form.level} onChange={(e) => setAssess({ ...assess, [a.key]: { ...form, level: e.target.value as ImpactLevel } })}>{IMPACT_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Justification (required)"><input className={control} value={form.justification} onChange={(e) => setAssess({ ...assess, [a.key]: { ...form, justification: e.target.value } })} /></Field>
          <Button onClick={() => { const err = onAssess(a, form.level, form.justification); setError(err ?? ""); }}>Record assessment</Button></div>
      </section>; })}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    <Section title="Revision matrix" subtitle="Expected versus found drawing revision at each stage. The first broken link is marked.">
      <div className="mobile-data-table"><table className="w-full min-w-[560px] text-sm"><thead><tr>{["Stage", "Expected revision", "Found revision", "Check date", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{matrix.map((r) => <tr key={r.stage} className={r.firstBreak ? "bg-error-bg" : ""}><td data-label="Stage" className={td}>{r.stage}{r.firstBreak && <span className="ml-2 font-mono text-[11px] uppercase text-error">Chain breaks here</span>}</td><td data-label="Expected revision" className={`${td} font-mono`}>{r.expected}</td><td data-label="Found revision" className={`${td} font-mono`}>{r.found}</td><td data-label="Check date" className={td}>{r.checkedAt?.slice(0, 10) ?? "—"}</td><td data-label="Status" className={td}><Tag tone={r.status === "Not checked" ? "neutral" : toneFor(r.status)}>{r.status}</Tag></td></tr>)}</tbody></table></div>
    </Section>
    <Section title="Document registry" subtitle="Revisions are selected by effective and superseded dates. Superseded revisions stay visible in gray.">
      <div className="mobile-data-table"><table className="w-full min-w-[860px] text-sm"><thead><tr>{["Type", "Document", "Revision", "Effective", "Superseded", "Status", "Owner", "Change reason", "Previous → next"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{registry.map((r) => <tr key={r.id} className={r.status === "Superseded" ? "text-text-tertiary" : ""}><td data-label="Document type" className={td}>{DOCUMENT_KIND_LABELS[r.kind]}</td><td data-label="Document" className={`${td} font-mono text-xs`}>{r.documentNumber}</td><td data-label="Revision" className={`${td} font-mono`}>{r.revision}</td><td data-label="Effective" className={td}>{r.effectiveFrom}</td><td data-label="Superseded" className={td}>{r.supersededOn ?? "—"}</td>
          <td data-label="Status" className={td}><Tag tone={r.status === "Superseded" ? "neutral" : toneFor(r.status)}>{r.status}</Tag></td><td data-label="Owner" className={td}>{r.owner}</td><td data-label="Change reason" className={td}>{r.changeReason}</td><td data-label="Previous → next" className={`${td} text-xs`}>{registry.find((x) => x.id === r.previousId)?.revision ?? "—"} → {registry.find((x) => x.id === r.nextId)?.revision ?? "—"}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 border-t border-border-subtle pt-4 lg:grid-cols-[100px_160px_minmax(0,1fr)_auto] lg:items-end">
        <Field label="New drawing revision"><input className={control} value={pub.revision} onChange={(e) => setPub({ ...pub, revision: e.target.value })} /></Field>
        <Field label="Effective date"><input type="date" className={control} value={pub.effectiveFrom} onChange={(e) => setPub({ ...pub, effectiveFrom: e.target.value })} /></Field>
        <Field label="Change reason"><input className={control} value={pub.changeReason} onChange={(e) => setPub({ ...pub, changeReason: e.target.value })} /></Field>
        <Button variant="outline" onClick={() => setError(onPublish(pub) ?? "")}>Publish synthetic revision</Button></div>
    </Section>
    <Section title="Verification snapshots" subtitle="Immutable record of the references used by each check. Later document changes never rewrite them.">
      {snapshots.length === 0 ? <p className="text-sm text-text-tertiary">No checks recorded yet. Buyer validation, decision approval and PO verification each save a snapshot.</p> :
      <div className="mobile-data-table"><table className="w-full min-w-[900px] text-sm"><thead><tr>{["Date", "Check", "Actor", "Supplier", "Drawing rev", "Spec", "RFQ ver", "Quote rev", "Expected", "Found", "Result", "Final status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{[...snapshots].reverse().map((s) => <tr key={s.id}><td data-label="Date" className={td}>{s.timestamp.slice(0, 10)}</td><td data-label="Check" className={td}>{s.checkType}</td><td data-label="Actor" className={td}>{s.actor}</td><td data-label="Supplier" className={td}>{s.supplier}</td><td data-label="Drawing revision" className={`${td} font-mono`}>{s.drawingRevision ?? "—"}</td><td data-label="Specification version" className={`${td} font-mono`}>{s.specificationVersion ?? "—"}</td><td data-label="RFQ version" className={`${td} font-mono`}>{s.rfqVersion ?? "—"}</td><td data-label="Quote revision" className={`${td} font-mono`}>{s.quoteRevision ?? "—"}</td><td data-label="Expected value" className={`${td} font-mono`}>{s.expectedRevision ?? "—"}</td><td data-label="Found value" className={`${td} font-mono`}>{s.foundRevision ?? "—"}</td><td data-label="Result" className={td}><Tag tone={toneFor(s.result)}>{s.result}</Tag></td><td data-label="Final status" className={td}>{s.finalStatus}</td></tr>)}</tbody></table></div>}
    </Section>
  </div>;
}
