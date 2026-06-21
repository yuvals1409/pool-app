import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { genderLabel } from "../lib/participantFields.js";
import { getStudentDemographics } from "../lib/commandCenter.js";
import { exportCsv } from "../lib/analytics.js";
import { useStudentProfile } from "../lib/StudentProfileContext.jsx";
import {
  CHART_COLORS,
  CHART_MARGIN_X_LABELS,
  CHART_MARGIN_Y_LABELS,
  AXIS_TICK,
  GRID_PROPS,
  LEGEND_PROPS,
  PIE_LAYOUT,
  categoryYAxisWidth,
  withSharePct,
  legendWithShare,
  makeRtlCategoryYAxisTick,
  RtlCategoryXAxisTick,
} from "../lib/chartTheme.js";
import ChartCanvas from "./charts/ChartCanvas.jsx";
import { Button, Card, Field, Select, SegmentedControl } from "./ui/ds/index.js";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function tenureLabel(t, bucket) {
  const map = {
    unknown: "tenureUnknown",
    "0-3m": "tenure0_3m",
    "3-12m": "tenure3_12m",
    "1-2y": "tenure1_2y",
    "2-3y": "tenure2_3y",
    "3-5y": "tenure3_5y",
    "5y+": "tenure5y",
  };
  return t(map[bucket] || "tenureUnknown");
}

function paymentLabel(t, status) {
  if (status === "paid") return t("paymentPaid");
  if (status === "waived") return t("paymentWaived");
  return t("paymentUnpaid");
}

export default function AdminStudentsTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const { openProfile } = useStudentProfile();
  const [seasonId, setSeasonId] = useState("");
  const [seasons, setSeasons] = useState([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState([]);
  const [demographics, setDemographics] = useState({});

  useEffect(() => {
    (async () => {
      const [{ data: seasonRows }, { data: season }] = await Promise.all([
        supabase.from("seasons").select("id, name, active").order("start_date", { ascending: false }),
        supabase.from("seasons").select("id").eq("active", true).maybeSingle(),
      ]);
      setSeasons(seasonRows || []);
      setSeasonId(season?.id || seasonRows?.[0]?.id || "");
    })();
  }, []);

  const load = useCallback(async () => {
    if (!seasonId) return;
    setLoading(true);
    try {
      const [{ data: rows, error }, demo] = await Promise.all([
        supabase
          .from("participants")
          .select(`
            id, full_name, gender, grade, first_enrolled_at,
            enrollments(id, active, payment_status, cancelled_at,
              product:products(id, name, day_of_week, start_time, season_id, schedule_pattern, product_templates(code)))
          `)
          .order("full_name"),
        getStudentDemographics(seasonId),
      ]);
      if (error) throw error;
      setParticipants(rows || []);
      setDemographics(demo || {});
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  const filteredStudents = useMemo(() => {
    return participants
      .map((p) => {
        const seasonEnrollments = (p.enrollments || []).filter(
          (e) => e.product?.season_id === seasonId,
        );
        const activeEnr = seasonEnrollments.find((e) => e.active);
        const hasCancelled = seasonEnrollments.some((e) => !e.active);
        return { ...p, seasonEnrollments, activeEnr, hasCancelled };
      })
      .filter((p) => {
        if (!p.seasonEnrollments.length) return false;
        if (statusFilter === "active") return !!p.activeEnr;
        if (statusFilter === "cancelled") return !p.activeEnr && p.hasCancelled;
        return true;
      })
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "he"));
  }, [participants, seasonId, statusFilter]);

  const genderChart = useMemo(() => {
    const rows = (demographics.by_gender || []).map((r) => ({
      name: r.gender === "unknown" ? t("genderUnknown") : genderLabel(t, r.gender),
      value: Number(r.cnt) || 0,
    }));
    return withSharePct(rows);
  }, [demographics, t]);

  const gradeChart = useMemo(() => {
    return (demographics.by_grade || [])
      .map((r) => ({
        name: r.grade || t("gradeUnknown"),
        count: Number(r.cnt) || 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [demographics, t]);

  const tenureChart = useMemo(() => {
    return (demographics.by_tenure || [])
      .map((r) => ({
        name: tenureLabel(t, r.bucket),
        count: Number(r.cnt) || 0,
      }))
      .filter((row) => row.count > 0);
  }, [demographics, t]);

  const tenureYWidth = categoryYAxisWidth(tenureChart.map((r) => r.name), 80, 120);
  const tenureYTick = useMemo(() => makeRtlCategoryYAxisTick(tenureYWidth), [tenureYWidth]);

  const exportStudentsCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    exportCsv(
      `students-${date}.csv`,
      [
        t("childName"),
        t("participantGenderLabel"),
        t("participantGradeLabel"),
        t("studentTenure"),
        t("studentCurrentGroup"),
        t("paymentStatus"),
      ],
      filteredStudents.map((p) => [
        p.full_name,
        genderLabel(t, p.gender),
        p.grade || t("gradeUnknown"),
        p.first_enrolled_at || "—",
        p.activeEnr
          ? formatProductLabel(p.activeEnr.product, DAY_NAMES, p.activeEnr.product?.product_templates?.code)
          : "—",
        p.activeEnr ? paymentLabel(t, p.activeEnr.payment_status) : "—",
      ]),
    );
  };

  const statusOptions = [
    { value: "active", label: t("studentsFilterActive") },
    { value: "all", label: t("studentsFilterAll") },
    { value: "cancelled", label: t("studentsFilterCancelled") },
  ];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabStudents")}</h1>
        </div>
      )}

      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
        <Field label={t("season")} style={{ marginBottom: 0, minWidth: 160 }}>
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("studentsStatusFilter")} style={{ marginBottom: 0 }}>
          <SegmentedControl options={statusOptions} value={statusFilter} onChange={setStatusFilter} size="sm" />
        </Field>
        <Button variant="secondary" size="sm" onClick={exportStudentsCsv} disabled={!filteredStudents.length}>
          {t("exportCsv")}
        </Button>
      </div>

      {loading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>{t("studentsDemographics")}</div>
          <div className="dashboard-charts dashboard-charts--3" style={{ marginBottom: 24 }}>
            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("participantGenderLabel")}</div>
              {genderChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={228}>
                  <PieChart>
                    <Pie
                      data={genderChart}
                      dataKey="value"
                      nameKey="name"
                      {...PIE_LAYOUT}
                      paddingAngle={genderChart.length > 1 ? 2 : 0}
                    >
                      {genderChart.map((row, i) => (
                        <Cell key={row.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, _name, item) => [
                        `${v} (${item?.payload?.sharePct ?? 0}%)`,
                        item?.payload?.name,
                      ]}
                    />
                    <Legend {...LEGEND_PROPS} formatter={legendWithShare} />
                  </PieChart>
                </ChartCanvas>
              )}
            </Card>

            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("participantGradeLabel")}</div>
              {gradeChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={228}>
                  <BarChart data={gradeChart} margin={CHART_MARGIN_X_LABELS} barCategoryGap="28%">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="name" tick={RtlCategoryXAxisTick} interval={0} height={48} />
                    <YAxis allowDecimals={false} width={44} tick={AXIS_TICK} />
                    <Tooltip />
                    <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ChartCanvas>
              )}
            </Card>

            <Card className="dashboard-chart-panel">
              <div className="dashboard-chart-title">{t("studentTenure")}</div>
              {tenureChart.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ChartCanvas height={228}>
                  <BarChart layout="vertical" data={tenureChart} margin={CHART_MARGIN_Y_LABELS}>
                    <CartesianGrid {...GRID_PROPS} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="name" width={tenureYWidth} tick={tenureYTick} />
                    <Tooltip />
                    <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ChartCanvas>
              )}
            </Card>
          </div>

          <div className="section-title" style={{ marginBottom: 8 }}>
            {t("tabStudents")} ({filteredStudents.length})
          </div>

          {isDesktop ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("childName")}</th>
                    <th className="col-text--mid">{t("participantGradeLabel")}</th>
                    <th className="col-text--mid">{t("participantGenderLabel")}</th>
                    <th>{t("studentCurrentGroup")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((p) => (
                    <tr
                      key={p.id}
                      className="data-table-row--clickable"
                      onClick={() => openProfile(p.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="col-text">{p.full_name}</td>
                      <td className="col-text--mid">{p.grade || t("gradeUnknown")}</td>
                      <td className="col-text--mid">{genderLabel(t, p.gender)}</td>
                      <td
                        className="col-text col-text--truncate"
                        title={
                          p.activeEnr
                            ? formatProductLabel(p.activeEnr.product, DAY_NAMES, p.activeEnr.product?.product_templates?.code)
                            : undefined
                        }
                      >
                        {p.activeEnr
                          ? formatProductLabel(p.activeEnr.product, DAY_NAMES, p.activeEnr.product?.product_templates?.code)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              {filteredStudents.map((p) => (
                <Card
                  key={p.id}
                  style={{ marginBottom: 8, cursor: "pointer" }}
                  onClick={() => openProfile(p.id)}
                >
                  <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                  <div className="log-meta">
                    {p.grade || t("gradeUnknown")}
                    {" · "}{genderLabel(t, p.gender)}
                  </div>
                  {p.activeEnr && (
                    <div className="log-meta">
                      {formatProductLabel(p.activeEnr.product, DAY_NAMES, p.activeEnr.product?.product_templates?.code)}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {filteredStudents.length === 0 && (
            <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
          )}
        </>
      )}
    </div>
  );
}
