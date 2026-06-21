import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getRevenueBreakdown, periodPresetRange } from "../lib/commandCenter.js";
import { toLocalDateStr } from "../lib/lessonDates.js";
import { exportCsv } from "../lib/analytics.js";
import {
  CHART_COLORS,
  CHART_MARGIN,
  AXIS_TICK,
  GRID_PROPS,
  LEGEND_PROPS,
  PIE_LAYOUT,
  formatAxisMoney,
  formatMoneyFull,
  legendWithShare,
} from "../lib/chartTheme.js";
import ChartCanvas from "./charts/ChartCanvas.jsx";
import { Button, Card, Field, Input, KpiCard, SegmentedControl } from "./ui/ds/index.js";

function domainLabel(t, domain) {
  const key = `financeDomain_${domain}`;
  const label = t(key);
  return label !== key ? label : domain;
}

function yearToDateRange() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today.getFullYear(), 0, 1);
  return {
    from: toLocalDateStr(start),
    to: toLocalDateStr(today),
  };
}

function formatMonthLabel(monthStart) {
  const raw = String(monthStart || "");
  const [year, month] = raw.slice(0, 7).split("-");
  if (!year || !month) return raw;
  return `${month}/${year.slice(2)}`;
}

export default function AdminFinanceTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const monthRange = periodPresetRange("month");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [from, setFrom] = useState(monthRange.from);
  const [to, setTo] = useState(monthRange.to);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  useEffect(() => {
    if (periodPreset === "month") {
      const r = periodPresetRange("month");
      setFrom(r.from);
      setTo(r.to);
    } else if (periodPreset === "week") {
      const r = periodPresetRange("week");
      setFrom(r.from);
      setTo(r.to);
    } else if (periodPreset === "year") {
      const r = yearToDateRange();
      setFrom(r.from);
      setTo(r.to);
    }
  }, [periodPreset]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRevenueBreakdown(from, to);
      setData(result || {});
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const byDomain = useMemo(() => {
    return (data.by_domain || [])
      .map((row) => ({
        ...row,
        name: domainLabel(t, row.domain),
        revenue: Number(row.revenue) || 0,
        paid_count: row.paid_count ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.paid_count - a.paid_count);
  }, [data.by_domain, t]);

  const pieChartData = useMemo(() => {
    const rows = byDomain.filter((row) => row.revenue > 0);
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    return rows.map((row) => ({
      ...row,
      sharePct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
    }));
  }, [byDomain]);

  const monthlyChart = useMemo(() => {
    return (data.monthly || []).map((row) => ({
      ...row,
      label: formatMonthLabel(row.month_start),
      revenue: Number(row.revenue) || 0,
    }));
  }, [data.monthly]);

  const totalRevenue = Number(data.total_revenue) || 0;
  const payingCustomers = Number(data.paying_customers) || 0;

  const avgPerCustomer = useMemo(() => {
    if (payingCustomers > 0 && totalRevenue > 0) {
      return Math.round(totalRevenue / payingCustomers);
    }
    const fromApi = Number(data.avg_revenue_per_customer ?? data.avg_per_customer);
    return fromApi > 0 ? Math.round(fromApi) : 0;
  }, [data, payingCustomers, totalRevenue]);

  const exportFinanceCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `finance-${date}.csv`,
      [t("financeByDomain"), t("financePaymentCount"), t("financeTotalRevenue")],
      [
        ...byDomain.map((row) => [row.name, row.paid_count, row.revenue]),
        [t("financeTotalRevenue"), payingCustomers, totalRevenue],
      ],
    );
  };

  const periodOptions = [
    { value: "week", label: t("ccPeriodWeek") },
    { value: "month", label: t("ccPeriodMonth") },
    { value: "year", label: t("financePeriodYear") },
  ];

  const formatRevenueCell = (row) => {
    if (row.revenue > 0) return `₪${formatMoneyFull(row.revenue)}`;
    if (row.paid_count > 0) return t("financeRevenuePending");
    return "—";
  };

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabFinance")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("financeOverview")}</p>

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("ccTrendPeriod")} style={{ marginBottom: 0 }}>
          <SegmentedControl options={periodOptions} value={periodPreset} onChange={setPeriodPreset} size="sm" />
        </Field>
        <Field label={t("validFrom")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={from} onChange={(e) => { setPeriodPreset("custom"); setFrom(e.target.value); }} dir="ltr" />
        </Field>
        <Field label={t("validUntil")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={to} onChange={(e) => { setPeriodPreset("custom"); setTo(e.target.value); }} dir="ltr" />
        </Field>
        <Button variant="secondary" size="sm" onClick={exportFinanceCsv} disabled={!byDomain.length}>
          {t("financeExportCsv")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <KpiCard label={t("financeTotalRevenue")} value={`₪${formatMoneyFull(totalRevenue)}`} />
            <KpiCard label={t("financePayingCustomers")} value={payingCustomers} />
            <KpiCard label={t("financeAvgPerCustomer")} value={`₪${formatMoneyFull(avgPerCustomer)}`} />
          </div>

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("financeByDomain")}</div>
              {pieChartData.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={240}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="revenue"
                      nameKey="name"
                      {...PIE_LAYOUT}
                      paddingAngle={pieChartData.length > 1 ? 2 : 0}
                    >
                      {pieChartData.map((row, i) => (
                        <Cell key={row.domain} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, _name, item) => [
                        `₪${formatMoneyFull(v)} (${item?.payload?.sharePct ?? 0}%)`,
                        item?.payload?.name,
                      ]}
                    />
                    <Legend {...LEGEND_PROPS} formatter={legendWithShare} />
                  </PieChart>
                </ChartCanvas>
              )}
            </Card>

            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("financeMonthlyTrend")}</div>
              {monthlyChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : monthlyChart.length === 1 ? (
                <div style={{ padding: "24px 8px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600, color: "var(--ink)" }}>
                    ₪{formatMoneyFull(monthlyChart[0].revenue)}
                  </div>
                  <div className="log-meta" style={{ marginTop: 8 }}>{monthlyChart[0].label}</div>
                </div>
              ) : (
                <ChartCanvas height={240}>
                  <LineChart data={monthlyChart} margin={CHART_MARGIN}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tickFormatter={formatAxisMoney} width={56} tick={AXIS_TICK} />
                    <Tooltip formatter={(v) => `₪${formatMoneyFull(v)}`} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name={t("financeTotalRevenue")}
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLORS[0] }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ChartCanvas>
              )}
            </Card>
          </div>

          {byDomain.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("financeByDomain")}</th>
                    <th>{t("financePaymentCount")}</th>
                    <th>{t("financeTotalRevenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byDomain
                    .filter((row) => row.revenue > 0 || row.paid_count > 0)
                    .map((row) => (
                    <tr key={row.domain}>
                      <td>{row.name}</td>
                      <td className="col-num">{row.paid_count}</td>
                      <td className="col-num">{formatRevenueCell(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
