import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getRevenueBreakdown, periodPresetRange } from "../lib/commandCenter.js";
import { exportCsv } from "../lib/analytics.js";
import { Button, Card, Field, Input, KpiCard, SegmentedControl } from "./ui/ds/index.js";

const PIE_COLORS = ["#0077B6", "#E17055", "#00B894", "#6C5CE7", "#FDCB6E"];

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
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("he-IL", { maximumFractionDigits: 0 });
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
  }, [from, to, toast, t]);

  useEffect(() => { load(); }, [load]);

  const byDomain = useMemo(() => {
    return (data.by_domain || []).map((row) => ({
      ...row,
      name: domainLabel(t, row.domain),
      revenue: Number(row.revenue) || 0,
      paid_count: row.paid_count ?? 0,
    }));
  }, [data.by_domain, t]);

  const monthlyChart = useMemo(() => {
    return (data.monthly || []).map((row) => ({
      ...row,
      label: String(row.month_start).slice(0, 7),
      revenue: Number(row.revenue) || 0,
    }));
  }, [data.monthly]);

  const exportFinanceCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `finance-${date}.csv`,
      [t("financeByDomain"), t("paymentPaid"), t("financeTotalRevenue")],
      [
        ...byDomain.map((row) => [row.name, row.paid_count, row.revenue]),
        [t("financeTotalRevenue"), data.paying_customers ?? 0, data.total_revenue ?? 0],
      ],
    );
  };

  const periodOptions = [
    { value: "week", label: t("ccPeriodWeek") },
    { value: "month", label: t("ccPeriodMonth") },
    { value: "year", label: t("financePeriodYear") },
  ];

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
            <KpiCard label={t("financeTotalRevenue")} value={`₪${formatMoney(data.total_revenue)}`} />
            <KpiCard label={t("financePayingCustomers")} value={data.paying_customers ?? 0} />
            <KpiCard label={t("financeAvgPerCustomer")} value={`₪${formatMoney(data.avg_per_customer)}`} />
          </div>

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card style={{ minHeight: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("financeByDomain")}</div>
              {byDomain.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byDomain} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {byDomain.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₪${formatMoney(v)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card style={{ minHeight: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("financeMonthlyTrend")}</div>
              {monthlyChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v) => `₪${formatMoney(v)}`} />
                    <Line type="monotone" dataKey="revenue" name={t("financeTotalRevenue")} stroke="#0077B6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {byDomain.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("financeByDomain")}</th>
                    <th>{t("paymentPaid")}</th>
                    <th>{t("financeTotalRevenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byDomain.map((row) => (
                    <tr key={row.domain}>
                      <td>{row.name}</td>
                      <td className="col-num">{row.paid_count}</td>
                      <td className="col-num">₪{formatMoney(row.revenue)}</td>
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
