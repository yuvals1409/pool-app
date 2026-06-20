import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { getMarketingFunnel, getSchoolOverviewKpis, periodPresetRange } from "../lib/commandCenter.js";
import { exportCsv } from "../lib/analytics.js";
import { Button, Card, Field, Input, KpiCard, SegmentedControl } from "./ui/ds/index.js";

const PIE_COLORS = ["#0077B6", "#E17055", "#00B894", "#6C5CE7", "#FDCB6E", "#636E72"];

function sourceLabel(t, source) {
  const key = `leadSource${String(source || "").charAt(0).toUpperCase()}${String(source || "").slice(1)}`;
  const label = t(key);
  return label !== key ? label : (source || t("genderUnknown"));
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

export default function AdminMarketingTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const monthRange = periodPresetRange("month");
  const [periodPreset, setPeriodPreset] = useState("month");
  const [from, setFrom] = useState(monthRange.from);
  const [to, setTo] = useState(monthRange.to);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [forecast, setForecast] = useState(null);
  const [waitlistCount, setWaitlistCount] = useState(0);

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

  const loadForecast = useCallback(async () => {
    try {
      const { data: nextSeason } = await supabase
        .from("seasons")
        .select("id, name, start_date")
        .eq("active", false)
        .gt("start_date", new Date().toISOString().slice(0, 10))
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      let season = nextSeason;
      if (!season) {
        const { data: activeSeason } = await supabase
          .from("seasons")
          .select("id, name, start_date")
          .eq("active", true)
          .maybeSingle();
        season = activeSeason;
      }
      if (!season) {
        setForecast(null);
        return;
      }

      const kpis = await getSchoolOverviewKpis(null, season.id);
      const { count } = await supabase
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting");
      setWaitlistCount(count ?? 0);
      setForecast({ season, kpis });
    } catch {
      setForecast(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMarketingFunnel(from, to);
      setData(result || {});
      await loadForecast();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, loadForecast]);

  useEffect(() => { load(); }, [load]);

  const funnelChart = useMemo(() => [
    { stage: t("marketingLeads"), count: data.leads ?? 0 },
    { stage: t("marketingAssessed"), count: data.assessed ?? 0 },
    { stage: t("marketingPassed"), count: data.passed ?? 0 },
    { stage: t("marketingEnrolled"), count: data.enrolled_annual ?? 0 },
  ], [data, t]);

  const sourceChart = useMemo(() => {
    return (data.by_source || []).map((row) => ({
      name: sourceLabel(t, row.source),
      value: row.cnt ?? 0,
    }));
  }, [data.by_source, t]);

  const exportMarketingCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `marketing-${date}.csv`,
      [t("marketingFunnel"), t("marketingCount")],
      [
        ...funnelChart.map((row) => [row.stage, row.count]),
        [t("marketingConversionAssessed"), `${data.conversion_assessed ?? 0}%`],
        [t("marketingConversionEnrolled"), `${data.conversion_enrolled ?? 0}%`],
        [],
        [t("marketingBySource"), t("marketingCount")],
        ...(data.by_source || []).map((row) => [sourceLabel(t, row.source), row.cnt ?? 0]),
      ],
    );
  };

  const periodOptions = [
    { value: "week", label: t("ccPeriodWeek") },
    { value: "month", label: t("ccPeriodMonth") },
    { value: "year", label: t("financePeriodYear") },
  ];

  const potentialDemand = (forecast?.kpis?.enrolled_seats ?? 0) + waitlistCount;

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabMarketing")}</h1>
        </div>
      )}

      <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("marketingOverview")}</p>

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
        <Button variant="secondary" size="sm" onClick={exportMarketingCsv}>
          {t("marketingExportCsv")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <KpiCard label={t("marketingLeads")} value={data.leads ?? 0} />
            <KpiCard label={t("marketingAssessed")} value={data.assessed ?? 0} />
            <KpiCard label={t("marketingPassed")} value={data.passed ?? 0} />
            <KpiCard label={t("marketingEnrolled")} value={data.enrolled_annual ?? 0} />
            <KpiCard label={t("marketingConversionAssessed")} value={`${data.conversion_assessed ?? 0}%`} />
            <KpiCard label={t("marketingConversionEnrolled")} value={`${data.conversion_enrolled ?? 0}%`} />
          </div>

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card style={{ minHeight: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("marketingFunnel")}</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={funnelChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0077B6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card style={{ minHeight: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("marketingBySource")}</div>
              {sourceChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={sourceChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {sourceChart.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {forecast && (
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t("marketingForecast")}</div>
              <div className="log-meta" style={{ marginBottom: 12 }}>
                {forecast.season.name}
              </div>
              <div className="dashboard-kpi-grid">
                <KpiCard
                  label={t("ccOccupancy")}
                  value={`${forecast.kpis.enrolled_seats ?? 0} / ${forecast.kpis.total_capacity ?? 0}`}
                />
                <KpiCard label={t("marketingWaitlistDemand")} value={waitlistCount} />
                <KpiCard label={t("marketingPotentialDemand")} value={potentialDemand} />
              </div>
              <p className="schedule-session-hint" style={{ marginTop: 12, marginBottom: 0 }}>
                {t("marketingForecastHint")}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
