import { useState } from "react";
import {
  FileText,
  Download,
  ZoomIn,
  ZoomOut,
  Printer,
  Maximize,
  ArrowLeft,
  List,
  Check,
  Send,
  FilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, control } from "./primitives";
import {
  buildPoDocument,
  downloadPoPdf,
  poProvenance,
  type PoDocument,
} from "@/lib/rfq/po-document";
import {
  lifecycleStatus,
  draftErrors,
  poLifecycleSteps,
  type PoLifecycleAction,
} from "@/lib/rfq/po-lifecycle";
import {
  poListRows,
  filterPoList,
  PO_COLUMNS,
  poListCells,
  poListCsv,
  type PoListFilter,
  type PoListRow,
} from "@/lib/rfq/po-list";
import type { ApprovedPoContext, PoState } from "@/lib/rfq/po-types";

function DocumentContent({ doc, zoom = 100 }: { doc: PoDocument; zoom?: number }) {
  return (
    <article
      className={`po-document min-w-0 border border-border-default bg-surface-card p-4 sm:p-8 ${zoom === 125 ? "text-base" : zoom === 150 ? "text-lg" : "text-sm"}`}
      aria-label="Purchase order document"
    >
      <header className="border-b-2 border-border-brand pb-5">
        <p className="font-medium text-text-brand">DEMO AEROSPACE PROCUREMENT</p>
        <h3 className="mt-2 text-2xl font-medium">Purchase order</h3>
        <p className="mt-2 break-words font-mono">
          {doc.number} · {doc.status}
        </p>
        <p className="mt-4 border-l-2 border-warning pl-3 text-sm text-warning">{doc.disclaimer}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.title} className="mt-6">
          <h4 className="border-b border-border-default pb-2 font-medium">{s.title}</h4>
          {s.columns.length === 2 ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {s.rows.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-text-secondary">{label}</dt>
                  <dd className="mt-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="mobile-data-table w-full text-left text-sm">
                <thead>
                  <tr>
                    {s.columns.map((c) => (
                      <th key={c} className="border-b border-border-default p-2 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} data-label={s.columns[j]} className="min-w-24 border-b border-border-subtle p-2">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <footer className="mt-8 border-t border-border-default pt-4 text-xs text-text-secondary">
        AeroQuote Compass · Synthetic data · Stephany Alves
      </footer>
    </article>
  );
}
function PoList({
  state,
  blocked,
  onOpen,
}: {
  state: PoState;
  blocked: boolean;
  onOpen: (r: PoListRow) => void;
}) {
  const rows = poListRows(state, blocked);
  const [filter, setFilter] = useState<PoListFilter>({
    search: "",
    status: "",
    supplier: "",
    rfq: "",
    buyer: "",
    currency: "",
    from: "",
    to: "",
    sort: "updated",
  });
  const [page, setPage] = useState(0),
    [columns, setColumns] = useState(PO_COLUMNS);
  const filtered = filterPoList(rows, filter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pageCount - 1);
  const update = (key: keyof PoListFilter, value: string) => {
    setFilter({ ...filter, [key]: value });
    setPage(0);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([poListCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "synthetic-purchase-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      className="space-y-4 border-b border-border-default pb-6"
      aria-label="Purchase orders list"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-medium">Purchase orders</h3>
        <Button variant="outline" onClick={download} disabled={!filtered.length}>
          <Download />
          Export list
        </Button>
      </div>
      <p className="text-sm text-text-secondary">
        Current RFQ · {rows.length} recorded PO version{rows.length === 1 ? "" : "s"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search purchase orders">
          <input
            className={control}
            value={filter.search}
            onChange={(e) => update("search", e.target.value)}
          />
        </Field>
        {(
          [
            ["status", "PO status", [...new Set(rows.map((r) => r.status))]],
            ["supplier", "PO supplier", [...new Set(rows.map((r) => r.po.supplier))]],
            ["rfq", "PO RFQ", [...new Set(rows.map((r) => r.rfq))]],
            ["buyer", "PO buyer", [...new Set(rows.map((r) => r.po.buyer))]],
            ["currency", "PO currency", ["USD", "EUR", "BRL"]],
          ] as const
        ).map(([key, label, options]) => (
          <Field label={label} key={key}>
            <select
              className={control}
              value={filter[key]}
              onChange={(e) => update(key, e.target.value)}
            >
              <option value="">All</option>
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="Issued from">
          <input
            className={control}
            type="date"
            value={filter.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </Field>
        <Field label="Issued through">
          <input
            className={control}
            type="date"
            value={filter.to}
            onChange={(e) => update("to", e.target.value)}
          />
        </Field>
        <Field label="Sort purchase orders">
          <select
            className={control}
            value={filter.sort}
            onChange={(e) => update("sort", e.target.value)}
          >
            <option value="updated">Last updated</option>
            <option value="number">PO number</option>
            <option value="amount">Amount (highest first)</option>
          </select>
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Columns</summary>
        <div className="mt-3 flex flex-wrap gap-4">
          {PO_COLUMNS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={columns.includes(c)}
                onChange={() =>
                  setColumns(columns.includes(c) ? columns.filter((v) => v !== c) : [...columns, c])
                }
              />
              {c}
            </label>
          ))}
        </div>
      </details>
      {!filtered.length ? (
        <p className="py-6 text-text-secondary">No purchase orders match this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mobile-data-table w-full text-left text-sm">
            <thead>
              <tr>
                {PO_COLUMNS.filter((c) => columns.includes(c)).map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap border-b border-border-default p-3 font-medium"
                  >
                    {c}
                  </th>
                ))}
                <th className="p-3">Document</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(safePage * 10, safePage * 10 + 10).map((r) => (
                <tr key={r.id}>
                  {poListCells(r).map((v, i) =>
                    columns.includes(PO_COLUMNS[i] ?? "") ? (
                      <td
                        data-label={PO_COLUMNS[i]}
                        key={i}
                        className="border-b border-border-subtle p-3"
                      >
                        {v}
                      </td>
                    ) : null,
                  )}
                  <td data-label="Document" className="border-b border-border-subtle p-3">
                    <Button variant="outline" size="sm" onClick={() => onOpen(r)}>
                      <FileText />
                      Open PO
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          {filtered.length} results · Page {safePage + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage + 1 >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
interface Props {
  state: PoState;
  context: ApprovedPoContext | null;
  blocked: boolean;
  onTransition: (action: PoLifecycleAction) => void;
  onError: (message: string) => void;
  onExport: () => void;
  draftDirty: boolean;
}
export function PoWorkspace({
  state,
  context,
  blocked,
  onTransition,
  onError,
  onExport,
  draftDirty,
}: Props) {
  const [view, setView] = useState<"check" | "list" | "document">("check"),
    [zoom, setZoom] = useState(100),
    [full, setFull] = useState(false),
    [historical, setHistorical] = useState<PoListRow | null>(null);
  const [confirm, setConfirm] = useState<PoLifecycleAction | null>(null);
  const docState = historical
    ? {
        ...state,
        po: historical.po,
        result: undefined,
        released: false,
        lifecycle: {
          phase: "Issued" as const,
          revision: historical.revision,
          actor: historical.po.buyer,
          updatedAt: historical.updated,
          history: [],
          issued: historical.po,
        },
      }
    : state;
  const original = context ? buildPoDocument(docState, context, blocked) : null;
  const doc =
    original && historical
      ? {
          ...original,
          status: historical.status,
          sections: original.sections.map((s) =>
            s.title === "Purchase order"
              ? {
                  ...s,
                  rows: s.rows.map((r) => (r[0] === "Status" ? ["Status", historical.status] : r)),
                }
              : s,
          ),
        }
      : original;
  const status = lifecycleStatus(state, blocked),
    phase = state.lifecycle?.phase;
  const pdf = async () => {
    if (!doc) return;
    try {
      await downloadPoPdf(doc);
      onExport();
    } catch {
      onError("Could not download the PO document. Please try again.");
    }
  };
  const print = () => {
    if (!doc) return;
    const w = window.open("", "_blank");
    if (!w) {
      onError("Allow the print window, then try again.");
      return;
    }
    const a = document.querySelector('[aria-label="Purchase order document"]');
    if (!a) {
      w.close();
      return;
    }
    w.document.title = doc.number;
    const title = w.document.createElement("p");
    title.textContent = doc.disclaimer;
    w.document.body.append(title, a.cloneNode(true));
    w.document.close();
    w.focus();
    w.print();
  };
  const act = (a: PoLifecycleAction) =>
    ["Issue", "Cancel", "Amend"].includes(a) ? setConfirm(a) : onTransition(a);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="PO views">
        <Button
          variant={view === "check" ? "default" : "outline"}
          onClick={() => {
            setView("check");
            setHistorical(null);
          }}
        >
          <Check />
          PO workflow
        </Button>
        <Button variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
          <List />
          PO list
        </Button>
        <Button
          variant={view === "document" ? "default" : "outline"}
          disabled={!state.po}
          onClick={() => {
            setHistorical(null);
            setView("document");
          }}
        >
          <FileText />
          View issued PO
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border-default py-4">
        <div>
          <p className="text-xs text-text-secondary">PO lifecycle</p>
          <p
            role="status"
            className={
              status === "Blocked"
                ? "font-medium text-error"
                : status === "Requires correction"
                  ? "font-medium text-warning"
                  : "font-medium"
            }
          >
            {status} · Revision {state.lifecycle?.revision ?? 1}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {state.lifecycle?.updatedAt ?? "Not yet recorded"} ·{" "}
            {state.lifecycle?.actor ?? "Marina Costa (Demo buyer)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === "Draft" && (
            <Button
              disabled={draftDirty || Boolean(state.po && draftErrors(state.po).length)}
              title={draftDirty ? "Save or discard draft changes before generating." : undefined}
              onClick={() => act("Generate")}
            >
              <FilePlus />
              Generate PO
            </Button>
          )}
          {phase === "Generated" && (
            <Button onClick={() => act("Issue")}>
              <Send />
              Issue PO
            </Button>
          )}
          {phase === "Issued" && (
            <Button onClick={() => act("Verify")}>
              <Check />
              Start verification
            </Button>
          )}
          {state.lifecycle &&
            ["Issued", "Awaiting verification"].includes(phase ?? "") &&
            status === "Verified" && (
              <Button onClick={() => act("Confirm verification")}>
                <Check />
                Confirm verification
              </Button>
            )}
          {phase === "Verified" && status === "Verified" && (
            <Button onClick={() => act("Prepare release")}>
              <Check />
              Prepare release
            </Button>
          )}
          {state.lifecycle?.issued && phase !== "Cancelled" && (
            <Button variant="outline" onClick={() => act("Amend")}>
              <FilePlus />
              Create amendment
            </Button>
          )}
          {state.lifecycle && phase !== "Cancelled" && !state.released && (
            <Button variant="outline" onClick={() => act("Cancel")}>
              Cancel PO
            </Button>
          )}
        </div>
      </div>
      {state.lifecycle && (
        <ol aria-label="PO lifecycle sequence" className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {poLifecycleSteps(state, blocked).map((s, i) => (
            <li key={s.label} className="border-l-2 border-border-default pl-2 text-xs">
              <p>
                {i + 1} · {s.label}
              </p>
              <p
                className={
                  s.status === "Blocked"
                    ? "mt-1 text-error"
                    : s.status === "Completed"
                      ? "mt-1 text-success"
                      : "mt-1 text-text-secondary"
                }
              >
                {s.status}
              </p>
            </li>
          ))}
        </ol>
      )}
      {view === "list" && (
        <PoList
          state={state}
          blocked={blocked}
          onOpen={(r) => {
            setHistorical(r.id === "current" ? null : r);
            setView("document");
          }}
        />
      )}
      {view === "document" && doc && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setView("check");
                setHistorical(null);
              }}
            >
              <ArrowLeft />
              Return to PO Check
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Zoom out"
              aria-label="Zoom out"
              disabled={zoom === 100}
              onClick={() => setZoom(zoom - 25)}
            >
              <ZoomOut />
            </Button>
            <span className="text-sm tabular-nums">{zoom}%</span>
            <Button
              variant="outline"
              size="icon"
              title="Zoom in"
              aria-label="Zoom in"
              disabled={zoom === 150}
              onClick={() => setZoom(zoom + 25)}
            >
              <ZoomIn />
            </Button>
            <Button variant="outline" onClick={print}>
              <Printer />
              Print PO
            </Button>
            <Button variant="outline" onClick={pdf}>
              <Download />
              Download PO PDF
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Fullscreen document"
              aria-label="Fullscreen document"
              onClick={() => setFull(true)}
            >
              <Maximize />
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
            <DocumentContent doc={doc} zoom={zoom} />
            <aside className="order-first space-y-3 border-l-2 border-border-brand pl-4 xl:order-last">
              <h3 className="font-medium">{doc.status} PO</h3>
              <p className="break-words text-sm">{doc.number}</p>
              <p className="text-sm">{state.po?.supplier}</p>
              <p className="text-sm text-text-secondary">
                Approved sourcing decision: {context?.decision.timestamp}
              </p>
            </aside>
          </div>
        </div>
      )}
      {context && state.po && (
        <details className="border-b border-border-default pb-4">
          <summary className="cursor-pointer font-medium">Decision to PO provenance</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="mobile-data-table w-full text-left text-sm">
              <thead>
                <tr>
                  {poProvenance(state, context).columns.map((c) => (
                    <th key={c} className="min-w-36 border-b border-border-default p-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poProvenance(state, context).rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td
                        key={j}
                        data-label={poProvenance(state, context).columns[j]}
                        className="border-b border-border-subtle p-2"
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{confirm} purchase order?</DialogTitle>
          <DialogDescription>
            {confirm === "Issue"
              ? "The saved document becomes immutable. Further changes require a new PO revision. Synthetic demonstration only; nothing is sent to a supplier."
              : confirm === "Amend"
                ? "The issued document is preserved as a superseded version. The new draft must be generated, issued and checked again."
                : "Cancellation locks this PO and prevents release. The document and audit record are retained."}
          </DialogDescription>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button
              onClick={() => {
                if (confirm) onTransition(confirm);
                setConfirm(null);
              }}
            >
              Confirm {confirm?.toLowerCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogTitle>Purchase order document</DialogTitle>
          <DialogDescription>{doc?.disclaimer}</DialogDescription>
          {doc && <DocumentContent doc={doc} zoom={zoom} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
