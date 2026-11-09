import { useState } from "react";
import { Check, ChevronDown, AlertTriangle, ListChecks, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TRACEABILITY, TRACE_OFFSET, type MainStep, type ProgressSummary } from "@/lib/rfq/navigation";
import type { bulkConfirmPlan } from "@/lib/rfq/bulk-confirm";

const tone = (s: MainStep["status"]) => s === "Blocked" ? "text-error" : s === "Complete" ? "text-success" : s === "Needs attention" ? "text-warning" : "text-text-secondary";
function StepIcon({ step, active }: { step: MainStep; active: boolean }) {
  return <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-sm border text-xs font-medium ${active ? "border-action-primary bg-action-primary text-text-inverse" : step.status === "Complete" ? "border-success text-success" : step.status === "Blocked" ? "border-error text-error" : "border-border-default text-text-secondary"}`}>{step.status === "Complete" && !active ? <Check className="size-3.5" strokeWidth={2} /> : step.status === "Blocked" && !active ? <AlertTriangle className="size-3.5" strokeWidth={1.5} /> : step.index + 1}</span>;
}

export function StepNav({ steps, current, summary, disabled, onSelect }: { steps: MainStep[]; current: number; summary: ProgressSummary; disabled: (i: number) => string | null; onSelect: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const inTrace = current >= TRACE_OFFSET;
  const pct = Math.round((summary.completed / steps.length) * 100);
  return <div className="border-b border-border-default bg-surface-raised">
    <nav aria-label="Procurement steps" className="mx-auto hidden max-w-7xl px-5 sm:px-8 md:block">
      <ol className="grid grid-cols-6 gap-2 py-3">{steps.map((s) => { const reason = disabled(s.index); const active = !inTrace && current === s.index; return <li key={s.label} className="min-w-0">
        <button type="button" aria-current={active ? "step" : undefined} disabled={Boolean(reason)} title={reason ?? undefined} onClick={() => onSelect(s.index)} className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm border-b-2 px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-action-primary" : "border-transparent hover:bg-surface-sunken"}`}>
          <StepIcon step={s} active={active} /><span className="min-w-0"><span className={`block text-sm leading-tight ${active ? "font-medium text-foreground" : "text-text-secondary"}`}>{s.label}</span><span className={`block text-xs ${tone(s.status)}`}>{s.status}</span></span>
        </button></li>; })}</ol>
    </nav>
    <div className="mx-auto max-w-7xl px-5 py-3 sm:px-8 md:hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><p className="text-xs text-text-secondary">{inTrace ? "Traceability" : summary.position}</p><p className="text-base font-medium">{inTrace ? TRACEABILITY[current - TRACE_OFFSET] : summary.current.label}</p></div><Button variant="outline" className="min-h-11" onClick={() => setOpen(true)} aria-haspopup="dialog"><ListChecks />All steps</Button></div>
      <div role="progressbar" aria-label="Steps completed" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={summary.completed} className="mt-3 h-1.5 w-full bg-surface-sunken"><div className="h-full bg-action-primary" style={{ width: `${pct}%` }} /></div>
    </div>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto"><SheetHeader><SheetTitle>All steps</SheetTitle><SheetDescription>{summary.completed} of {steps.length} steps complete.</SheetDescription></SheetHeader>
      <ol className="mt-4 space-y-1">{steps.map((s) => { const reason = disabled(s.index); return <li key={s.label}><button type="button" disabled={Boolean(reason)} onClick={() => { onSelect(s.index); setOpen(false); }} className="flex min-h-12 w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50"><StepIcon step={s} active={!inTrace && current === s.index} /><span className="min-w-0"><span className="block text-sm font-medium">{s.label}</span><span className={`block text-xs ${tone(s.status)}`}>{reason ?? s.status}</span></span></button></li>; })}</ol>
      <p className="mt-5 text-xs text-text-secondary">Traceability</p>
      <ul className="mt-1 space-y-1">{TRACEABILITY.map((t, i) => <li key={t}><button type="button" onClick={() => { onSelect(TRACE_OFFSET + i); setOpen(false); }} className="flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring">{t}</button></li>)}</ul>
    </SheetContent></Sheet>
  </div>;
}

export function ProgressLine({ summary, stages }: { summary: ProgressSummary; stages: MainStep["stages"] }) {
  return <section aria-label="Progress summary" className="space-y-3 rounded-md border border-border-default bg-surface-card p-4">
    <dl className="grid gap-3 text-sm sm:grid-cols-[auto_auto_minmax(0,1fr)]">
      <div><dt className="text-xs text-text-secondary">Overall status</dt><dd className={summary.overall === "Blocked" ? "font-medium text-error" : summary.overall === "Released" ? "font-medium text-success" : "font-medium"}>{summary.overall}</dd></div>
      <div className="sm:pl-6"><dt className="text-xs text-text-secondary">Current</dt><dd className="font-medium">{summary.position} · {summary.current.label}</dd></div>
      <div className="min-w-0 sm:pl-6"><dt className="text-xs text-text-secondary">Next step</dt><dd className="break-words">{summary.next}</dd></div>
    </dl>
    {summary.blockers.length > 0 && <ul aria-label="Blockers" className="space-y-1 border-t border-border-subtle pt-3 text-sm text-error">{summary.blockers.map((b) => <li key={b} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />Blocked: {b}</li>)}</ul>}
    {stages.length > 0 && <ul aria-label="Step checklist" className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-3 text-xs">{stages.map((s) => <li key={s.label} className={s.status === "Blocked" ? "text-error" : s.status === "Confirmed" || s.status === "Received" || s.status === "Extracted" ? "text-success" : s.status === "In review" ? "text-warning" : "text-text-secondary"}>{s.label}: {s.status}</li>)}</ul>}
  </section>;
}

export function TraceabilityMenu({ current, onSelect }: { current: number; onSelect: (i: number) => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="text-text-secondary">Traceability<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel className="text-xs text-text-secondary">Traceability</DropdownMenuLabel>{TRACEABILITY.map((t, i) => <DropdownMenuItem key={t} onSelect={() => onSelect(TRACE_OFFSET + i)} aria-current={current === TRACE_OFFSET + i ? "page" : undefined}>{t}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

export function DemoData({ hasData, busy, onClassic, onExtended }: { hasData: boolean; busy: boolean; onClassic: () => void; onExtended: () => void }) {
  const [pending, setPending] = useState<null | "classic" | "extended">(null);
  const run = (k: "classic" | "extended") => (k === "classic" ? onClassic : onExtended)();
  const ask = (k: "classic" | "extended") => hasData ? setPending(k) : run(k);
  return <section aria-labelledby="demo-data" className="space-y-4 rounded-md border border-border-default bg-surface-card p-5">
    <div className="flex items-start gap-3"><Database className="mt-0.5 size-5 shrink-0 text-text-secondary" strokeWidth={1.5} /><div className="min-w-0"><h3 id="demo-data" className="text-lg font-medium">Demo data</h3><p className="mt-1 text-sm text-text-secondary">Synthetic data only. Loading a set <strong className="font-medium text-foreground">restarts the RFQ</strong>: it replaces the RFQ details, quotes, decisions, PO and audit trail currently on screen. Saved history is not affected.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button variant="outline" className="h-auto min-h-11 flex-col items-start whitespace-normal py-3 text-left" disabled={busy} onClick={() => ask("classic")}><span className="font-medium">Classic sample · 4 quotes</span><span className="text-xs font-normal text-text-secondary">Raw quote text; runs AI extraction.</span></Button>
      <Button variant="outline" className="h-auto min-h-11 flex-col items-start whitespace-normal py-3 text-left" disabled={busy} onClick={() => ask("extended")}><span className="font-medium">Extended sample · 20 quotes</span><span className="text-xs font-normal text-text-secondary">Pre-extracted demo records; no AI calls.</span></Button>
    </div>
    <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace the current RFQ?</AlertDialogTitle><AlertDialogDescription>Loading the {pending === "classic" ? "classic 4-quote" : "extended 20-quote"} sample replaces every quote, review, decision, PO and audit entry on screen. Unsaved work will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep current data</AlertDialogCancel><AlertDialogAction onClick={() => { if (pending) run(pending); setPending(null); }}>Replace with sample</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export function BulkConfirmDialog({ plan, scopeLabel, onCancel, onConfirm }: { plan: ReturnType<typeof bulkConfirmPlan> | null; scopeLabel: string; onCancel: () => void; onConfirm: () => Promise<void> | void }) {
  const [working, setWorking] = useState(false);
  return <AlertDialog open={plan !== null} onOpenChange={(o) => { if (!o && !working) onCancel(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>Confirm reliable fields · {scopeLabel}</AlertDialogTitle><AlertDialogDescription>Review what will be confirmed before continuing.</AlertDialogDescription></AlertDialogHeader>
    {plan && <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-3 gap-3"><div><dt className="text-xs text-text-secondary">Quotations affected</dt><dd className="text-xl font-medium tabular-nums">{plan.quotations}</dd></div><div><dt className="text-xs text-text-secondary">Fields to confirm</dt><dd className="text-xl font-medium tabular-nums">{plan.fields}</dd></div><div><dt className="text-xs text-text-secondary">Critical still pending</dt><dd className="text-xl font-medium tabular-nums text-warning">{plan.criticalPending}</dd></div></dl>
      <div><p className="text-xs text-text-secondary">Never confirmed in bulk</p><p className="break-words">{plan.excluded.join(", ")}, and any field with a divergence.</p></div>
      <p className="text-xs text-text-secondary">{plan.rule}</p>
    </div>}
    <AlertDialogFooter><AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel><AlertDialogAction disabled={working || !plan?.fields} onClick={async (e) => { e.preventDefault(); if (working) return; setWorking(true); try { await onConfirm(); } finally { setWorking(false); } }}>{working ? "Confirming…" : `Confirm ${plan?.fields ?? 0} fields`}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
