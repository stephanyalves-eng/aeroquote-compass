const LOCALE = "en-US";
const NA = "Not provided";
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
export const formatCurrency = (v: number | null | undefined, currency = "USD", digits = 0) => ok(v) ? new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) : NA;
export const formatNumber = (v: number | null | undefined, digits = 0) => ok(v) ? v.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits }) : NA;
export const formatPercent = (v: number | null | undefined, digits = 1) => ok(v) ? `${formatNumber(v, digits)}%` : NA;
export const formatDays = (v: number | null | undefined) => ok(v) ? `${formatNumber(v)} ${v === 1 ? "day" : "days"}` : NA;
/** ISO date (YYYY-MM-DD) to "Mar 15, 2027" without time-zone shifts. */
export const formatDate = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return NA;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
};
