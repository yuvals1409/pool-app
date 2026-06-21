import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getRevenueForecast, forecastDefaultRange } from "../lib/commandCenter.js";
import { exportCsv } from "../lib/analytics.js";
import {
  CHART_COLORS,
  CHART_MARGIN_X_LABELS,
  AXIS_TICK,
  GRID_PROPS,
  LEGEND_PROPS,
  PIE_LAYOUT,
  formatAxisMoney,
  formatMoneyFull,
  legendWithShare,
} from "../lib/chartTheme.js";
import ChartCanvas from "./charts/ChartCanvas.jsx";
import { Button, Card, Field, Input, KpiCard } from "./ui/ds/index.js";

function domainLabel(t, domain) {
  const key = `financeDomain_${domain}`;
  const label = t(key);
  return label !== key ? label : domain;
}

function formatWeekLabel(dateStr) {
  const raw = String(dateStr || "");
  const [, month, day] = raw.split("-");
  if (!month || !day) return raw;
  return `${day}/${month}`;
}

export default function AdminRevenueForecastTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const defaultRange = forecastDefaultRange(90);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRevenueForecast(from, to);
      setData(result || {});
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, toast, t]);

  useEffect(() => { load(); }, [load]);

  const byDomain = useMemo(() => (
    (data.by_domain || []).map((row) => ({
      ...row,
      name: domainLabel(t, row.domain),
      revenue: Number(row.revenue) || 0,
      session_count: row.session_count ?? 0,
    }))
  ), [data.by_domain, t]);

  const pieChartData = useMemo(() => {
    const rows = byDomain.filter((row) => row.revenue > 0);
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    return rows.map((row) => ({
      ...row,
      sharePct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
    }));
  }, [byDomain]);

  const periodChart = useMemo(() => (
    (data.by_period || []).map((row) => ({
      ...row,
      label: formatWeekLabel(row.period_start),
      revenue: Number(row.revenue) || 0,
    }))
  ), [data.by_period]);

  const participants = useMemo(() => (
    (data.by_participant || []).map((row) => ({
      ...row,
      revenue: Number(row.revenue) || 0,
      session_count: row.session_count ?? 0,
    }))
  ), [data.by_participant]);

  const exportForecastCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `revenue-forecast-${date}.csv`,
      [t("childName"), t("financeByDomain"), t("financeSessionCount"), t("financeTotalRevenue")],
      participants.map((row) => [
        row.participant_name || "—",
        row.product_label || domainLabel(t, row.domain),
        row.session_count,
        row.revenue,
      ]),
    );
  };

  const forecastRevenue = Number(data.forecast_revenue) || 0;
  const forecastSessions = Number(data.forecast_sessions) || 0;
  const forecastParticipants = Number(data.forecast_participants) || 0;
  const realizedInRange = Number(data.realized_in_range) || 0;

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabRevenueForecast")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("revenueForecastOverview")}</p>

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("validFrom")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </Field>
        <Field label={t("validUntil")} style={{ marginBottom: 0, minWidth: 140 }}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </Field>
        <Button variant="secondary" size="sm" onClick={exportForecastCsv} disabled={!participants.length}>
          {t("financeExportCsv")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <KpiCard label={t("revenueForecastTotal")} value={`₪${formatMoneyFull(forecastRevenue)}`} />
            <KpiCard label={t("revenueForecastSessions")} value={forecastSessions} />
            <KpiCard label={t("revenueForecastParticipants")} value={forecastParticipants} />
            <KpiCard label={t("revenueForecastRealizedInRange")} value={`₪${formatMoneyFull(realizedInRange)}`} />
          </div>

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("revenueForecastByPeriod")}</div>
              {periodChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={260}>
                  <BarChart data={periodChart} margin={CHART_MARGIN_X_LABELS}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tickFormatter={formatAxisMoney} width={56} tick={AXIS_TICK} />
                    <Tooltip formatter={(v) => `₪${formatMoneyFull(v)}`} />
                    <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ChartCanvas>
              )}
            </Card>

            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("financeByDomain")}</div>
              {pieChartData.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={260}>
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
          </div>

          {participants.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("childName")}</th>
                    <th>{t("financeByDomain")}</th>
                    <th>{t("financeSessionCount")}</th>
                    <th>{t("financeTotalRevenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((row) => (
                    <tr key={`${row.participant_id}-${row.product_label}`}>
                      <td>{row.participant_name || "—"}</td>
                      <td>{row.product_label || "—"}</td>
                      <td className="col-num">{row.session_count}</td>
                      <td className="col-num">₪{formatMoneyFull(row.revenue)}</td>
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
