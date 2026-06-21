/** Shared Recharts styling for Stream Line admin analytics. */

export const CHART_COLORS = ["#0077B6", "#E17055", "#00B894", "#6C5CE7", "#FDCB6E", "#636E72"];

export const CHART_MARGIN = { top: 12, right: 12, left: 4, bottom: 4 };
export const CHART_MARGIN_X_LABELS = { top: 12, right: 12, left: 4, bottom: 40 };
export const CHART_MARGIN_Y_LABELS = { top: 8, right: 16, left: 4, bottom: 8 };

export const AXIS_TICK = {
  fontSize: 11,
  fill: "var(--ink-mid)",
  fontFamily: "var(--font-sans)",
};

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
  vertical: false,
};

export const LEGEND_PROPS = {
  verticalAlign: "bottom",
  iconType: "circle",
  wrapperStyle: {
    fontSize: 11,
    fontFamily: "var(--font-sans)",
    paddingTop: 8,
  },
};

export const PIE_LAYOUT = {
  cx: "50%",
  cy: "44%",
  innerRadius: 40,
  outerRadius: 68,
};

export function shortChartLabel(text, max = 14) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

export function formatAxisCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

export function formatAxisMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "₪0";
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₪${Math.round(v / 1_000)}K`;
  return `₪${Math.round(v).toLocaleString("he-IL")}`;
}

export function formatMoneyFull(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export function angledXAxisTick(maxLen = 12) {
  return {
    dataKey: undefined,
    tick: { fontSize: 10, fill: "var(--ink-mid)", fontFamily: "var(--font-sans)" },
    interval: 0,
    height: 52,
    angle: -32,
    textAnchor: "end",
    tickFormatter: (v) => shortChartLabel(v, maxLen),
  };
}

export function categoryYAxisWidth(labels = [], min = 72, max = 120) {
  const longest = labels.reduce((m, s) => Math.max(m, String(s || "").length), 0);
  return Math.min(max, Math.max(min, longest * 6 + 12));
}

export function withSharePct(rows, valueKey = "value") {
  const total = rows.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0);
  return rows
    .filter((row) => Number(row[valueKey]) > 0)
    .map((row) => ({
      ...row,
      sharePct: total > 0 ? Math.round((Number(row[valueKey]) / total) * 100) : 0,
    }));
}

export function legendWithShare(value, entry) {
  const pct = entry?.payload?.sharePct;
  return pct != null ? `${value} (${pct}%)` : value;
}
