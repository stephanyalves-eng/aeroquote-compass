import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, control } from "./primitives";
import { currentSupplierConfirmation, type ConfirmationInput } from "@/lib/rfq/po-confirmation";
import type { PoState } from "@/lib/rfq/po-types";

export function PoConfirmation({ state, onSave }: { state: PoState; onSave: (input: ConfirmationInput) => boolean }) {
  const saved = currentSupplierConfirmation(state);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState<ConfirmationInput>({ confirmedOn: saved?.confirmedOn ?? "", expectedDelivery: saved?.expectedDelivery ?? "", reference: saved?.reference ?? "" });
  const allowed = Boolean(state.po && (!state.lifecycle || state.lifecycle.issued) && state.lifecycle?.phase !== "Cancelled");
  return <section aria-label="Supplier confirmation" className="space-y-4 border-y border-border-default py-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">Supplier confirmation</h3><p className="text-sm text-text-secondary">{saved ? "Recorded" : "Not yet recorded"}</p></div>
    {saved && <dl className="grid gap-3 sm:grid-cols-3">{[["Confirmation date", saved.confirmedOn], ["Expected delivery date", saved.expectedDelivery], ["Confirmation reference", saved.reference || "Not provided"]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}<div className="text-xs text-text-secondary sm:col-span-3">{saved.timestamp} · {saved.actor}</div></dl>}
    {!allowed ? <p className="text-sm text-text-secondary">{state.lifecycle?.phase === "Cancelled" ? "PO cancelled" : "Awaiting PO issue"}</p> : saved && !editing ? <Button variant="outline" onClick={() => { setInput({ confirmedOn: saved.confirmedOn, expectedDelivery: saved.expectedDelivery, reference: saved.reference }); setEditing(true); }}>Update supplier confirmation</Button> : <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (onSave(input)) setEditing(false); }}>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Supplier confirmation date"><input className={control} type="date" required value={input.confirmedOn} onChange={(e) => setInput({ ...input, confirmedOn: e.target.value })} /></Field><Field label="Supplier expected delivery date"><input className={control} type="date" required value={input.expectedDelivery} onChange={(e) => setInput({ ...input, expectedDelivery: e.target.value })} /></Field><Field label="Supplier confirmation reference"><input className={control} value={input.reference} onChange={(e) => setInput({ ...input, reference: e.target.value })} /></Field></div>
      <div className="flex flex-wrap gap-2"><Button type="submit"><Check />Save supplier confirmation</Button>{saved && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}</div>
    </form>}
  </section>;
}