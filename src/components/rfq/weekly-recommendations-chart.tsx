import { useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { WEEKLY_RECOMMENDATION_SNAPSHOT as snapshot, weeklyRecommendationLabel, weeklyRecommendationSummary } from "@/lib/rfq/weekly-recommendations";

export function WeeklyRecommendationsChart() {
  const [mode, setMode] = useState<"real" | "demo">("real");
  const totals = weeklyRecommendationSummary(snapshot.weeks);
  return (
    <section aria-labelledby="weekly-recommendations-title" className="min-w-0 border-y border-border-default py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-text-tertiary">Buyer-confirmed quotations</p>
          <h3 id="weekly-recommendations-title" className="mt-1 text-xl font-medium">Weekly RFQ recommendations</h3>
          <p className="mt-1 text-sm text-text-secondary">Weeks begin Monday · America/Sao_Paulo · Published-app activity</p>
        </div>
        <div role="group" aria-label="Recommendation data series" className="flex shrink-0 gap-1">
          <Button size="sm" variant={mode === "real" ? "default" : "outline"} aria-pressed={mode === "real"} onClick={() => setMode("real")}>Real RFQs</Button>
          <Button size="sm" variant={mode === "demo" ? "default" : "outline"} aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>Demo RFQs</Button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-medium tabular-nums">{totals[mode]}</span>
        <span className="text-sm text-text-secondary">{mode === "real" ? "real" : "demo"} RFQs recommended · {totals.trackedWeeks} tracked week (partial)</span>
      </div>
      <div className="mt-4 h-56 min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={snapshot.weeks} margin={{ top: 12, right: 12, left: -20, bottom: 4 }}>
            <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="week" tickFormatter={weeklyRecommendationLabel} tick={{ fill: "var(--text-tertiary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} tick={{ fill: "var(--text-tertiary)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip labelFormatter={(label) => `Week of ${weeklyRecommendationLabel(String(label))}`} cursor={false} />
            <Bar dataKey={mode} name={mode === "real" ? "Real RFQs" : "Demo RFQs"} fill={mode === "real" ? "var(--chart-1)" : "var(--chart-3)"} maxBarSize={48} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-text-secondary">No recommendations recorded since tracking began on Nov 9, 2026 (São Paulo). Earlier weeks were not tracked.</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-text-brand">Weekly counts</summary>
        <table className="mt-3 w-full text-left">
          <caption className="sr-only">Weekly buyer-confirmed RFQ recommendations</caption>
          <thead className="border-b border-border-default text-xs text-text-tertiary"><tr><th className="py-2 font-medium">Week of</th><th className="py-2 font-medium">Real</th><th className="py-2 font-medium">Demo</th><th className="py-2 font-medium">Coverage</th></tr></thead>
          <tbody>{snapshot.weeks.map((row) => <tr key={row.week} className="border-b border-border-subtle"><th className="py-2 font-normal">{weeklyRecommendationLabel(row.week)}</th><td>{row.real ?? "—"}</td><td>{row.demo ?? "—"}</td><td>{row.coverage}</td></tr>)}</tbody>
        </table>
      </details>
      <p className="mt-4 text-xs text-text-tertiary">Snapshot updated Nov 9, 2026, 22:08 (São Paulo) · Not live · Updates require a new analytics snapshot.</p>
    </section>
  );
}