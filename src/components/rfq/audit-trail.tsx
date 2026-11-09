import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Section, Field, control } from "./primitives";
import { Tag, toneFor } from "./tone";
import { EMPTY_TIMELINE_FILTER, filterTimeline, type TimelineEvent, type TimelineFilter } from "@/lib/rfq/audit-timeline";
const LABELS: Record<keyof TimelineFilter, string> = { supplier: "Supplier", partNumber: "Part number", document: "Document", revision: "Revision", poNumber: "PO", type: "Event type" };
export function AuditTrail({ events }: { events: TimelineEvent[] }) {
  const [f, setF] = useState<TimelineFilter>(EMPTY_TIMELINE_FILTER);
  const shown = useMemo(() => filterTimeline(events, f), [events, f]);
  const opts = (k: keyof TimelineFilter) => [...new Set(events.map((e) => e[k]).filter((x) => x && x !== "—"))].sort();
  return <Section title="Auditable timeline" subtitle="Every document, validation, decision, PO and inspection event with its revision and fictional owner.">
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{(Object.keys(LABELS) as (keyof TimelineFilter)[]).map((k) => <Field key={k} label={LABELS[k]}><select className={control} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">All</option>{opts(k).map((o) => <option key={o}>{o}</option>)}</select></Field>)}</div>
    <div className="flex items-center gap-3 text-sm"><span>{shown.length} of {events.length} events</span>{Object.values(f).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY_TIMELINE_FILTER)}>Clear filters</Button>}</div>
    {shown.length === 0 ? <p className="rounded-sm border border-dashed border-border-default p-6 text-center text-sm text-text-tertiary">No events match these filters.</p> :
    <ol className="space-y-0 border-l border-border-default">{shown.map((e) => <li key={e.id} className="ml-4 border-b border-border-subtle py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-text-tertiary">{e.timestamp.slice(0, 16).replace("T", " ")}</span><span className="font-medium">{e.type}</span><Tag tone={e.result === "Superseded" ? "neutral" : toneFor(e.result)}>{e.result}</Tag></div>
      <p className="mt-1 text-text-secondary">{e.stage} · Document <span className="font-mono">{e.document}</span> · Revision <span className="font-mono">{e.revision}</span> · {e.actor}{e.supplier !== "—" ? ` · ${e.supplier}` : ""}{e.poNumber !== "—" ? ` · ${e.poNumber}` : ""}</p>
      <p className="text-text-tertiary">Impact: {e.impact}{e.related.length ? ` · Related to ${e.related.length} earlier event(s)` : ""}</p></li>)}</ol>}
  </Section>;
}
