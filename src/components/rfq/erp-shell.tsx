import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Files,
  ClipboardCheck,
  Scale,
  Award,
  ShoppingCart,
  PackageCheck,
  GitBranch,
  ScrollText,
  Search as SearchIcon,
  Bell,
  Menu,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  CircleDot,
  User,
  History as HistoryIcon,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ERP_NAV,
  ERP_NAV_GROUPS,
  DASHBOARD_STEP,
  type ErpProcessStep,
  type ErpStepStatus,
} from "@/lib/rfq/erp-nav";
import type { SearchEntry } from "@/lib/rfq/search";
import type { AttentionItem, OperationItem } from "@/lib/rfq/operations";
import type { RfqReference } from "@/lib/rfq/types";
import type { RfqStatus } from "@/lib/rfq/workflow";
import { WeeklyRecommendationsChart } from "./weekly-recommendations-chart";

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  rfq: FileText,
  quotes: Files,
  validation: ClipboardCheck,
  comparison: Scale,
  decisions: Award,
  po: ShoppingCart,
  release: PackageCheck,
  configuration: GitBranch,
  audit: ScrollText,
  investigations: OctagonAlert,
};

function NavList({
  current,
  disabled,
  onSelect,
  collapsed,
}: {
  current: number;
  disabled: (step: number) => string | null;
  onSelect: (step: number) => void;
  collapsed: boolean;
}) {
  return (
    <nav aria-label="ERP modules" className="space-y-4">
      {ERP_NAV_GROUPS.map((group) => (
        <div key={group}>
          {!collapsed && (
            <p className="px-2 pb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
              {group}
            </p>
          )}
          <ul className="space-y-0.5">
            {ERP_NAV.filter((i) => i.group === group).map((item) => {
              const Icon = NAV_ICONS[item.id] ?? Circle;
              const reason = disabled(item.step);
              const active = current === item.step && (item.step !== 5 || item.id === "po");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    title={
                      collapsed
                        ? reason
                          ? `${item.label} — ${reason}`
                          : item.label
                        : (reason ?? undefined)
                    }
                    aria-current={active ? "page" : undefined}
                    disabled={Boolean(reason)}
                    onClick={() => onSelect(item.step)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-action-primary/10 font-medium text-foreground" : "text-text-secondary hover:bg-surface-sunken hover:text-foreground"} ${collapsed ? "justify-center" : ""}`}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface SidebarProps {
  current: number;
  disabled: (step: number) => string | null;
  onSelect: (step: number) => void;
  onHistory: () => void;
  onNewRfq: () => void;
  busy: boolean;
}

export function ErpSidebar({
  current,
  disabled,
  onSelect,
  onHistory,
  onNewRfq,
  busy,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-default bg-surface-raised md:flex ${collapsed ? "w-14" : "w-56"}`}
    >
      <div className="flex-1 overflow-y-auto p-2">
        <NavList current={current} disabled={disabled} onSelect={onSelect} collapsed={collapsed} />
      </div>
      <div className="space-y-1 border-t border-border-subtle p-2">
        <button
          type="button"
          title={collapsed ? "RFQ History" : undefined}
          disabled={busy}
          onClick={onHistory}
          className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-sm text-text-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50 ${collapsed ? "justify-center" : ""}`}
        >
          <HistoryIcon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {!collapsed && "RFQ History"}
        </button>
        <button
          type="button"
          title={collapsed ? "New RFQ" : undefined}
          disabled={busy}
          onClick={onNewRfq}
          className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-sm text-text-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50 ${collapsed ? "justify-center" : ""}`}
        >
          <Plus className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          {!collapsed && "New RFQ"}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-sm text-text-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring ${collapsed ? "justify-center" : ""}`}
        >
          {collapsed ? (
            <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({
  current,
  disabled,
  onSelect,
  onHistory,
  onNewRfq,
  busy,
}: SidebarProps) {
  const [drawer, setDrawer] = useState(false);
  const select = (step: number) => {
    onSelect(step);
    setDrawer(false);
  };
  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        onClick={() => setDrawer(true)}
        className="size-11 text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse"
      >
        <Menu />
      </Button>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>AeroQuote Compass</SheetTitle>
            <SheetDescription>ERP navigation</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <NavList current={current} disabled={disabled} onSelect={select} collapsed={false} />
          </div>
          <div className="mt-4 space-y-1 border-t border-border-subtle pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onHistory();
                setDrawer(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-sm text-text-secondary hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50"
            >
              <HistoryIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
              RFQ History
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onNewRfq();
                setDrawer(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-sm text-text-secondary hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50"
            >
              <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
              New RFQ
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function GlobalSearch({
  entries,
  onSearch,
  onSelect,
}: {
  entries: SearchEntry[];
  onSearch: (query: string) => SearchEntry[];
  onSelect: (entry: SearchEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = onSearch(query);
  void entries;
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <SearchIcon
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-inverse/60"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Global search: RFQ, supplier, quote, part number, PO, drawing or revision"
        placeholder="Search RFQ, supplier, PO…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="min-h-11 w-full rounded-sm border border-text-inverse/20 bg-text-inverse/10 pl-9 pr-3 text-sm text-text-inverse placeholder:text-text-inverse/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring md:min-h-9"
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-sm border border-border-default bg-surface-card py-1 text-foreground shadow-none"
        >
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                  {r.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.label}</span>
                  <span className="block truncate text-xs text-text-secondary">{r.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Notifications({
  items,
  onSelect,
}: {
  items: AttentionItem[];
  onSelect: (step: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications: ${items.length} items require attention`}
          className="relative size-11 text-text-inverse hover:bg-text-inverse/10 hover:text-text-inverse md:size-9"
        >
          <Bell strokeWidth={1.5} />
          {items.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-signal text-[10px] font-medium text-surface-inverse"
            >
              {items.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs text-text-secondary">
          Requires attention
        </DropdownMenuLabel>
        {items.length === 0 && (
          <DropdownMenuItem disabled>Nothing requires attention.</DropdownMenuItem>
        )}
        {items.slice(0, 6).map((i) => (
          <DropdownMenuItem
            key={i.id}
            className="min-h-11 flex-col items-start gap-0.5"
            onSelect={() => onSelect(i.step)}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium">{i.process}</span>
              <span
                className={`text-xs ${i.severity === "Critical" ? "text-error" : i.severity === "High" ? "text-warning" : "text-text-secondary"}`}
              >
                {i.severity}
              </span>
            </span>
            <span className="line-clamp-2 whitespace-normal text-xs text-text-secondary">
              {i.reason}
            </span>
          </DropdownMenuItem>
        ))}
        {items.length > 6 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSelect(DASHBOARD_STEP)}>
              View all on the dashboard
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Breadcrumb({ trail }: { trail: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-text-inverse/75">
        {trail.map((crumb, i) => (
          <li key={crumb} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            <span
              aria-current={i === trail.length - 1 ? "page" : undefined}
              className={`truncate ${i === trail.length - 1 ? "font-medium text-text-inverse" : ""}`}
            >
              {crumb}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DemoUser() {
  return (
    <span
      className="hidden items-center gap-2 text-xs text-text-inverse/75 lg:flex"
      title="Fictional demonstration user"
    >
      <User className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Marina Costa · Demo buyer
    </span>
  );
}

const STEP_ICONS: Record<ErpStepStatus, typeof Circle> = {
  "Not started": Circle,
  "In progress": CircleDot,
  "Requires attention": AlertTriangle,
  Blocked: OctagonAlert,
  Completed: CheckCircle2,
};
const STEP_TONE: Record<ErpStepStatus, string> = {
  "Not started": "text-text-tertiary",
  "In progress": "text-info",
  "Requires attention": "text-warning",
  Blocked: "text-error",
  Completed: "text-success",
};

export function ProcessStepper({ steps }: { steps: ErpProcessStep[] }) {
  return (
    <nav
      aria-label="Process flow"
      className="overflow-x-auto rounded-md border border-border-default bg-surface-card"
    >
      <ol className="flex min-w-max items-stretch">
        {steps.map((s, i) => {
          const Icon = STEP_ICONS[s.status];
          return (
            <li
              key={s.label}
              className="flex min-w-36 flex-1 flex-col gap-1 border-l border-border-subtle px-3 py-2 first:border-l-0"
            >
              <span className="flex items-center gap-1.5">
                <Icon
                  className={`size-4 shrink-0 ${STEP_TONE[s.status]}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                  {i + 1}
                </span>
              </span>
              <span className="text-sm font-medium leading-tight">{s.label}</span>
              <span className={`text-xs ${STEP_TONE[s.status]}`}>{s.status}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function RecordHeader({
  reference,
  status,
  saveLabel,
}: {
  reference: RfqReference;
  status: RfqStatus;
  saveLabel: string;
}) {
  const fields: [string, string][] = [
    ["Part number", reference.partNumber || "Not provided"],
    ["Current revision", reference.revision || "Not provided"],
    [
      "Annual quantity",
      reference.annualVolume != null ? String(reference.annualVolume) : "Not provided",
    ],
    ["Base currency", "USD"],
    ["Owner", "Marina Costa (Demo buyer)"],
    ["Status", status],
    ["Analysis date", reference.today || "Not provided"],
    ["Save state", saveLabel],
  ];
  return (
    <section
      aria-labelledby="record-title"
      className="rounded-md border border-border-default bg-surface-card p-4 md:p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="record-title"
          className="break-words text-xl font-medium tracking-[-0.02em] md:text-2xl"
        >
          {reference.rfqNumber || "New RFQ"}
        </h2>
        <p className="text-sm text-text-secondary">
          {reference.description || "Describe the RFQ in RFQ Setup."}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {fields.map(([dt, dd]) => (
          <div key={dt} className="min-w-0">
            <dt className="text-xs text-text-secondary">{dt}</dt>
            <dd className="truncate font-medium">{dd}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const SEVERITY_TONE: Record<AttentionItem["severity"], string> = {
  Critical: "text-error",
  High: "text-warning",
  Medium: "text-info",
};

export function DashboardView({
  items,
  attention,
  onSelect,
  reference,
}: {
  items: OperationItem[];
  attention: AttentionItem[];
  onSelect: (step: number) => void;
  reference: RfqReference;
}) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="dashboard-title">
        <h2 id="dashboard-title" className="text-2xl font-medium tracking-[-0.02em] md:text-4xl">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Operational overview of {reference.rfqNumber || "the current RFQ"}. Every item opens the
          exact point of the flow that needs action.
        </p>
      </section>
      <section
        aria-label="Operational indicators"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.step)}
            className="flex min-h-24 flex-col justify-between rounded-md border border-border-default bg-surface-card p-4 text-left transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <span className="text-xs text-text-secondary">{item.label}</span>
            <span
              className={`text-3xl font-medium tabular-nums ${item.count ? (item.tone === "error" ? "text-error" : item.tone === "warning" ? "text-warning" : "text-foreground") : "text-text-tertiary"}`}
            >
              {item.count}
            </span>
            <span className="text-xs text-text-secondary">{item.action}</span>
          </button>
        ))}
      </section>
      <section
        aria-labelledby="attention-title"
        className="rounded-md border border-border-default bg-surface-card"
      >
        <div className="border-b border-border-subtle p-4">
          <h3 id="attention-title" className="text-lg font-medium">
            Requires attention
          </h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            Ordered by severity and due date. Synthetic demonstration data.
          </p>
        </div>
        {attention.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">
            Nothing requires attention. The process is up to date.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {attention.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.step)}
                  className="grid w-full gap-2 p-4 text-left transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.process}</span>
                    <span className={`block text-xs ${SEVERITY_TONE[a.severity]}`}>
                      {a.severity}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm">{a.reason}</span>
                    <span className="block text-xs text-text-secondary">
                      {a.owner}
                      {a.due ? ` · Due ${a.due}` : ""}
                    </span>
                  </span>
                  <span className="justify-self-start rounded-sm border border-border-default px-2 py-1 text-xs font-medium text-foreground sm:justify-self-end">
                    {a.nextAction}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <WeeklyRecommendationsChart />
    </div>
  );
}
