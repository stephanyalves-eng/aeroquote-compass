import { Button } from "@/components/ui/button";
import type { Intelligence } from "@/lib/rfq/intelligence";
import type { RfqReference } from "@/lib/rfq/types";
import { comparisonHighlights } from "@/lib/rfq/presentation";
import { classifyEligibility } from "@/lib/rfq/eligibility";
import { EligibilityBadge } from "./recommendation-panel";
import { Money, Supplier } from "./primitives";

export function ComparisonHighlights({ list, reference, recommendedId }: { list: Intelligence[]; reference: RfqReference; recommendedId: string | null }) {
  const highlights = comparisonHighlights(list, reference, recommendedId);
  return <div className="space-y-4 border-y border-border-subtle py-4"><dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{highlights.map(({ label, supplier }) => <div key={label} className="min-w-0"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-words font-medium">{supplier?.name ?? "Not provided"}</dd>{supplier && <dd className="mt-1 text-sm"><Money value={supplier.annualLanded} /> annual · {supplier.risk} risk</dd>}</div>)}</dl><details><summary className="min-h-11 cursor-pointer text-sm font-medium text-error">Blocked suppliers ({list.filter((a) => !a.eligible).length})</summary><ul className="space-y-2 text-sm">{list.filter((a) => !a.eligible).map((a) => <li key={a.document.id}>{a.name} · {classifyEligibility(a, a.document).reasons.join("; ")}</li>)}</ul></details></div>;
}
export function ComparisonCards({ list, selected, onSelected, onDetails, recommendedId }: { list: Intelligence[]; selected: string[]; onSelected: (id: string) => void; onDetails: (id: string) => void; recommendedId: string | null }) {
  return <div className="grid gap-4 md:grid-cols-2">{list.map((a) => {
    const eligibility = classifyEligibility(a, a.document);
    const advantage = [...a.contributions].sort((x, y) => (y.weighted ?? -1) - (x.weighted ?? -1))[0];
    return <article key={a.document.id} className="min-w-0 space-y-4 rounded-lg border border-border-default p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0 space-y-2"><h3 className="break-words font-medium"><Supplier name={a.baseline.quote.supplier_name} source={a.document.text} /></h3><EligibilityBadge status={eligibility.status} />{a.document.id === recommendedId && <p className="text-sm font-medium text-success">Best Overall · Recommended</p>}</div><label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"><span className="sr-only">Shortlist {a.name}</span><input type="checkbox" className="size-5" checked={selected.includes(a.document.id)} disabled={selected.length >= 4 && !selected.includes(a.document.id)} onChange={() => onSelected(a.document.id)} /></label></div>
      <dl className="grid grid-cols-2 gap-3 text-sm">{[["Annual landed cost", <Money value={a.annualLanded} />], ["Score", a.score == null ? "Not provided" : `${a.score.toFixed(1)} / 100`], ["Lead time", a.baseline.quote.lead_time_days == null ? "Not provided" : `${a.baseline.quote.lead_time_days} days`], ["Risk", `${a.risk} risk`]].map(([label, value], i) => <div key={i} className="min-w-0"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      <p className="text-sm"><span className="text-text-secondary">Main advantage: </span>{advantage?.reason ?? "Not yet calculated"}</p><p className={`text-sm ${!a.eligible ? "text-error" : "text-text-secondary"}`}>Main blocker: {!a.eligible ? eligibility.reasons.join("; ") : "None — eligible for award"}</p>
      <Button variant="outline" className="min-h-11 w-full" onClick={() => onDetails(a.document.id)}>View details</Button>
    </article>;
  })}</div>;
}