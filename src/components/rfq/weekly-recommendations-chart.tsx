import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { weeklyRecommendationsQuery } from "@/lib/rfq/weekly-recommendations-query";
import {
  weeklyRecommendationLabel,
  weeklyRecommendationSummary,
  weeklyRecommendationRows,
  recommendationPeriodRange,
  type RecommendationPeriod,
} from "@/lib/rfq/weekly-recommendations";

export function WeeklyRecommendationsChart() {
  const [mode, setMode] = useState<"real" | "demo">("real");
  const { data: snapshot, isRefetchError } = useSuspenseQuery(weeklyRecommendationsQuery);
  const [period, setPeriod] = useState<RecommendationPeriod>("4");
  const [custom, setCustom] = useState(() => recommendationPeriodRange("4", snapshot.updatedAt));
  const range = period === "custom" ? custom : recommendationPeriodRange(period, snapshot.updatedAt);
  const { rows, error } = weeklyRecommendationRows(snapshot, range.start, range.end);
  const totals = weeklyRecommendationSummary(rows);
  return (
    <section
      aria-labelledby="weekly-recommendations-title"
      className="min-w-0 border-y border-border-default py-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-text-tertiary">
            Buyer-confirmed quotations
          </p>
          <h3 id="weekly-recommendations-title" className="mt-1 text-xl font-medium">
            Weekly RFQ recommendations
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Weeks begin Monday · America/Sao_Paulo · Confirmed-recommendation activity
          </p>
        </div>
        <div role="group" aria-label="Recommendation data series" className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant={mode === "real" ? "default" : "outline"}
            aria-pressed={mode === "real"}
            onClick={() => setMode("real")}
          >
            Real RFQs
          </Button>
          <Button
            size="sm"
            variant={mode === "demo" ? "default" : "outline"}
            aria-pressed={mode === "demo"}
            onClick={() => setMode("demo")}
          >
            Demo RFQs
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label htmlFor="recommendation-period" className="mb-1 block text-sm text-text-secondary">Period</label>
          <Select value={period} onValueChange={(value) => {
            if (value === "4" || value === "8" || value === "12" || value === "custom") setPeriod(value);
          }}>
            <SelectTrigger id="recommendation-period" aria-label="Recommendation period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">Last 4 weeks</SelectItem>
              <SelectItem value="8">Last 8 weeks</SelectItem>
              <SelectItem value="12">Last 12 weeks</SelectItem>
              <SelectItem value="custom">Custom dates</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && <>
          <label className="min-w-0 text-sm text-text-secondary">Start date
            <Input type="date" aria-label="Recommendation start date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
          </label>
          <label className="min-w-0 text-sm text-text-secondary">End date
            <Input type="date" aria-label="Recommendation end date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
          </label>
        </>}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">{range.start} – {range.end} · Whole calendar weeks</p>
      {error && <p role="alert" className="mt-2 text-sm text-status-error">{error}</p>}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-medium tabular-nums">{totals[mode]}</span>
        <span className="text-sm text-text-secondary">
          {mode === "real" ? "real" : "demo"} RFQs recommended · {totals.trackedWeeks} tracked weeks
        </span>
      </div>
      <div className="mt-4 h-56 min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 12, right: 12, left: -20, bottom: 4 }}>
            <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={weeklyRecommendationLabel}
              tick={{ fill: "var(--text-tertiary)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(1, max)]}
              tick={{ fill: "var(--text-tertiary)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              labelFormatter={(label) => `Week of ${weeklyRecommendationLabel(String(label))}`}
              cursor={false}
            />
            <Bar
              dataKey={mode}
              name={mode === "real" ? "Real RFQs" : "Demo RFQs"}
              fill={mode === "real" ? "var(--chart-1)" : "var(--chart-3)"}
              maxBarSize={48}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        {totals[mode] === 0 ? "No recommendations recorded in the tracked weeks of this period. " : ""}
        Earlier untracked weeks have unknown totals.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-text-brand">Weekly counts</summary>
        <table className="mt-3 w-full text-left">
          <caption className="sr-only">Weekly buyer-confirmed RFQ recommendations</caption>
          <thead className="border-b border-border-default text-xs text-text-tertiary">
            <tr>
              <th className="py-2 font-medium">Week of</th>
              <th className="py-2 font-medium">Real</th>
              <th className="py-2 font-medium">Demo</th>
              <th className="py-2 font-medium">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.week} className="border-b border-border-subtle">
                <th className="py-2 font-normal">{weeklyRecommendationLabel(row.week)}</th>
                <td>{row.real ?? "—"}</td>
                <td>{row.demo ?? "—"}</td>
                <td>{row.coverage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-4 text-xs text-text-tertiary">
        Updated {new Date(snapshot.updatedAt).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })} (São Paulo)
        {isRefetchError || snapshot.unavailable ? " · Update unavailable; showing last received totals." : " · Automatic updates"}
      </p>
    </section>
  );
}
