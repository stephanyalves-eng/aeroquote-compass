import { useEffect, useMemo, useState } from "react";
import { toggleShortlist } from "@/lib/rfq/presentation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Field, Money, control } from "./primitives";
import { Tag, toneFor, th, td } from "./tone";
import {
  activeFilters,
  EMPTY_FILTERS,
  filterAndSort,
  SORT_LABELS,
  statusTotals,
  VIEW_LABELS,
  type ExplorerFilters,
  type ExplorerRow,
  type ExplorerView,
  type SortKey,
} from "@/lib/rfq/quote-explorer";
import { ELIGIBILITY_LABELS } from "@/lib/rfq/eligibility";

export function QuoteExplorer({
  rows,
  selected,
  onSelected,
  onFiltered,
}: {
  rows: ExplorerRow[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  onFiltered: (ids: string[] | null) => void;
}) {
  const [f, setF] = useState<ExplorerFilters>({
    ...EMPTY_FILTERS,
    view: rows.length > 6 ? "shortlist" : "all",
  });
  const filters = { ...f, selected };
  const visible = useMemo(() => filterAndSort(rows, { ...f, selected }), [rows, f, selected]);
  useEffect(() => {
    const narrowed = Boolean(
      f.search ||
      f.revision ||
      f.eligibility ||
      f.risk ||
      f.currency ||
      f.status ||
      !["all", "shortlist"].includes(f.view),
    );
    onFiltered(narrowed ? visible.map((r) => r.id) : null);
  }, [visible, f, onFiltered]);
  const totals = statusTotals(rows),
    chips = activeFilters(filters);
  const opts = (key: keyof ExplorerRow) => [...new Set(rows.map((r) => String(r[key])))].sort();
  const set = (patch: Partial<ExplorerFilters>) => setF({ ...f, ...patch });
  const toggle = (id: string) => onSelected(toggleShortlist(selected, id));
  return (
    <Section
      title="Quotation explorer"
      subtitle={`${totals.total} quotations · ${totals.eligible} eligible · ${totals.caveats} eligible with caveats · ${totals.notEligible} not eligible · ${totals.awaiting} awaiting buyer validation`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search supplier, quote ID, RFQ or part number">
          <input
            className={control}
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="e.g. Atlas, QM-77, PN-45Y1258"
          />
        </Field>
        <Field label="Quoted revision">
          <select
            className={control}
            value={f.revision}
            onChange={(e) => set({ revision: e.target.value })}
          >
            <option value="">All revisions</option>
            {opts("revision").map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Eligibility">
          <select
            className={control}
            value={f.eligibility}
            onChange={(e) => set({ eligibility: e.target.value })}
          >
            <option value="">All</option>
            {Object.entries(ELIGIBILITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Risk">
          <select
            className={control}
            value={f.risk}
            onChange={(e) => set({ risk: e.target.value })}
          >
            <option value="">All</option>
            {opts("risk").map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select
            className={control}
            value={f.currency}
            onChange={(e) => set({ currency: e.target.value })}
          >
            <option value="">All</option>
            {opts("currency").map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Buyer validation status">
          <select
            className={control}
            value={f.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="">All</option>
            {opts("status").map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Sort by">
          <select
            className={control}
            value={f.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
          >
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div role="tablist" aria-label="Comparison view" className="flex flex-wrap gap-2">
        {(Object.keys(VIEW_LABELS) as ExplorerView[]).map((v) => (
          <Button
            key={v}
            role="tab"
            aria-selected={f.view === v}
            size="sm"
            variant={f.view === v ? "default" : "outline"}
            onClick={() => set({ view: v })}
          >
            {VIEW_LABELS[v]}
            {v === "selected" ? ` (${selected.length})` : ""}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="font-medium">
          {visible.length} of {rows.length} quotations shown
        </span>
        {chips.map((c) => (
          <Button
            variant="outline"
            size="sm"
            key={c.key}
            className="inline-flex items-center gap-1 rounded-sm border border-border-default px-2 py-0.5 text-xs"
            onClick={() =>
              set({ [c.key]: c.key === "view" ? "all" : "" } as Partial<ExplorerFilters>)
            }
            aria-label={`Remove filter ${c.label}`}
          >
            {c.label}
            <X className="size-3" strokeWidth={1.5} />
          </Button>
        ))}
        {chips.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setF(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        )}
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onSelected([])}>
            Clear selection
          </Button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border-default p-6 text-center text-sm text-text-tertiary">
          No quotations match these filters. Clear a filter to see more results.
        </p>
      ) : (
        <details className="rounded-sm border border-border-default">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">
            Full quotation table · {visible.length} results
          </summary>
          <div className="max-h-[480px] overflow-auto">
            <table className="explorer-table w-full min-w-[960px] text-sm tabular-nums">
              <thead className="sticky top-0 z-20 bg-surface-sunken">
                <tr>
                  {[
                    "Select",
                    "Supplier",
                    "Quote ID",
                    "Rev",
                    "Currency",
                    "Buyer validation",
                    "Eligibility",
                    "Risk",
                    "Unit price (USD)",
                    "Annual landed",
                    "Score",
                    "Lead time",
                    "AI confidence",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={r.recommended ? "bg-surface-accent" : ""}>
                    <td className={td}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.supplier}`}
                        checked={selected.includes(r.id)}
                        disabled={selected.length >= 4 && !selected.includes(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className={td}>
                      {r.supplier}
                      {r.recommended && (
                        <span className="ml-2">
                          <Tag tone="success">Recommended</Tag>
                        </span>
                      )}
                    </td>
                    <td className={`${td} font-mono text-xs`}>{r.quoteId}</td>
                    <td className={`${td} font-mono text-xs`}>{r.revision}</td>
                    <td className={td}>{r.currency}</td>
                    <td className={td}>
                      <Tag tone={toneFor(r.status)}>{r.status}</Tag>
                    </td>
                    <td className={td}>
                      <Tag tone={toneFor(r.eligibilityLabel)}>{r.eligibilityLabel}</Tag>
                    </td>
                    <td className={td}>{r.risk}</td>
                    <td className={td}>
                      <Money value={r.unitPrice} />
                    </td>
                    <td className={td}>
                      <Money value={r.landed} />
                    </td>
                    <td className={td}>{r.score == null ? "—" : r.score.toFixed(1)}</td>
                    <td className={td}>
                      {r.leadTime == null ? "Not provided" : `${r.leadTime} days`}
                    </td>
                    <td className={td}>
                      {r.confidence == null ? "Not provided" : `${Math.round(r.confidence)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Section>
  );
}
