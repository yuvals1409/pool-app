import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabase.js";
import {
  getDashboardSummary,
  getAttendanceByWeek,
  getAttendanceByProduct,
  getAttendanceByInstructor,
  getScanVsAttendance,
  getRevenueBySeason,
  getAssessmentConversionFunnel,
  getEnrollmentStats,
  exportCsv,
} from "../lib/analytics.js";
import {
  getSchoolOverviewKpis,
  getOccupancyTrend,
  getSchoolHealthScore,
  periodPresetRange,
} from "../lib/commandCenter.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { Button, Card, Field, Input, KpiCard, Select, Badge, SegmentedControl } from "./ui/ds/index.js";

const PIE_COLORS = ["#0077B6", "#E17055", "#00B894"];
const HEALTH_VARIANT = { green: "success", yellow: "warn", red: "danger" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function AdminDashboardTab({ toast }) {
  const { t } = useLang();
  const isDesktop = useIsDesktop();
  const [periodPreset, setPeriodPreset] = useState("month");
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [productId, setProductId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [products, setProducts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [ccLoading, setCcLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [kpis, setKpis] = useState({});
  const [occupancyTrend, setOccupancyTrend] = useState([]);
  const [health, setHealth] = useState({});
  const [summary, setSummary] = useState({});
  const [weekly, setWeekly] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [byInstructor, setByInstructor] = useState([]);
  const [scanVs, setScanVs] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [enrollmentPie, setEnrollmentPie] = useState([]);
  const [funnel, setFunnel] = useState({});

  useEffect(() => {
    (async () => {
      const [{ data: seasonRows }, { data: season }] = await Promise.all([
        supabase.from("seasons").select("id, name, active").order("start_date", { ascending: false }),
        supabase.from("seasons").select("id").eq("active", true).maybeSingle(),
      ]);
      setSeasons(seasonRows || []);
      const sid = season?.id || seasonRows?.[0]?.id;
      if (sid) {
        setSeasonId(sid);
        const { data } = await supabase.from("products").select("id, name").eq("season_id", sid).order("name");
        setProducts(data || []);
      }
    })();
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    (async () => {
      const { data } = await supabase.from("products").select("id, name").eq("season_id", seasonId).order("name");
      setProducts(data || []);
      setProductId("");
    })();
  }, [seasonId]);

  const loadCommandCenter = useCallback(async () => {
    if (!seasonId) return;
    setCcLoading(true);
    try {
      const { from: trendFrom, to: trendTo, asOf } = periodPresetRange(periodPreset);
      const [kpiData, trend, healthData] = await Promise.all([
        getSchoolOverviewKpis(asOf, seasonId || null),
        getOccupancyTrend(trendFrom, trendTo, seasonId || null),
        getSchoolHealthScore(asOf),
      ]);
      setKpis(kpiData);
      setOccupancyTrend(
        trend.map((r) => ({ ...r, label: String(r.week_start).slice(5) })),
      );
      setHealth(healthData);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setCcLoading(false);
  }, [seasonId, periodPreset, toast, t]);

  const loadLegacy = useCallback(async () => {
    setLegacyLoading(true);
    try {
      const pid = productId || null;
      const [sum, week, prod, instr, scan, rev, enroll, fun] = await Promise.all([
        getDashboardSummary(from, to),
        getAttendanceByWeek(from, to, pid),
        getAttendanceByProduct(from, to),
        getAttendanceByInstructor(from, to, pid),
        getScanVsAttendance(from, to, pid),
        getRevenueBySeason(seasonId || null),
        getEnrollmentStats(),
        getAssessmentConversionFunnel(from, to),
      ]);
      setSummary(sum);
      setWeekly(week.map((r) => ({ ...r, label: String(r.week_start).slice(5) })));
      setByProduct(prod);
      setByInstructor(instr);
      setScanVs(scan.map((r) => ({ ...r, label: String(r.week_start).slice(5) })));
      setRevenue(rev);
      setFunnel(fun);

      const payMap = { paid: 0, unpaid: 0, waived: 0 };
      for (const row of enroll) {
        payMap[row.payment_status] = (payMap[row.payment_status] || 0) + row.count;
      }
      setEnrollmentPie([
        { name: t("paymentPaid"), value: payMap.paid || 0 },
        { name: t("paymentUnpaid"), value: payMap.unpaid || 0 },
        { name: t("paymentWaived"), value: payMap.waived || 0 },
      ].filter((x) => x.value > 0));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLegacyLoading(false);
  }, [from, to, productId, seasonId, toast, t]);

  useEffect(() => { loadCommandCenter(); }, [loadCommandCenter]);
  useEffect(() => { loadLegacy(); }, [loadLegacy]);

  const funnelData = [
    { stage: t("dashboardFunnelRegistered"), count: funnel.registered || 0 },
    { stage: t("dashboardFunnelPassed"), count: funnel.passed || 0 },
    { stage: t("dashboardFunnelFailed"), count: funnel.failed || 0 },
    { stage: t("dashboardFunnelSummer"), count: funnel.summer_enrolled || 0 },
    { stage: t("dashboardFunnelClass"), count: funnel.class_enrolled || 0 },
  ];

  const exportReport = (type) => {
    const date = todayStr();
    if (type === "instructor") {
      exportCsv(`attendance-instructor-${date}.csv`,
        [t("instructor"), t("attendancePresent"), t("attendanceAbsent"), t("dashboardAttendanceRate")],
        byInstructor.map((r) => [r.instructor_name, r.present_count, r.absent_count, r.attendance_rate]));
    } else if (type === "scan") {
      exportCsv(`scan-vs-attendance-${date}.csv`,
        [t("week"), t("dashboardExpected"), t("dashboardScanMarks"), t("dashboardInstructorMarks"), t("dashboardScanRate"), t("dashboardAttendanceRate")],
        scanVs.map((r) => [r.week_start, r.expected, r.scanned, r.instructor_marked, r.scan_rate_pct, r.attendance_rate_pct]));
    } else if (type === "revenue") {
      exportCsv(`revenue-by-season-${date}.csv`,
        [t("season"), t("paymentPaid"), t("paymentUnpaid"), t("paymentWaived"), t("dashboardGrossRevenue"), t("dashboardPotentialRevenue")],
        revenue.map((r) => [r.season_name, r.paid_count, r.unpaid_count, r.waived_count, r.gross_revenue, r.potential_revenue]));
    }
  };

  const periodOptions = [
    { value: "today", label: t("ccPeriodToday") },
    { value: "week", label: t("ccPeriodWeek") },
    { value: "month", label: t("ccPeriodMonth") },
  ];

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabDashboard")}</h1>
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
        <Field label={t("ccTrendPeriod")} style={{ marginBottom: 0 }}>
          <SegmentedControl
            options={periodOptions}
            value={periodPreset}
            onChange={setPeriodPreset}
            size="sm"
          />
        </Field>
      </div>

      {ccLoading ? (
        <div className="loading-center">{t("loading")}</div>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 8 }}>{t("ccOverviewTitle")}</div>
          <p className="schedule-session-hint" style={{ marginBottom: 12 }}>{t("ccActiveStudentHint")}</p>

          <div className="dashboard-kpi-grid">
            <KpiCard label={t("ccActiveStudents")} value={kpis.active_students ?? 0} />
            <KpiCard label={t("ccActiveGroups")} value={kpis.active_groups ?? 0} />
            <KpiCard label={t("ccActiveInstructors")} value={kpis.active_instructors ?? 0} />
            <KpiCard label={t("ccOccupancy")} value={`${kpis.occupancy_pct ?? 0}%`} />
            <KpiCard label={t("ccNewThisMonth")} value={kpis.new_this_month ?? 0} />
            <KpiCard label={t("ccChurnedThisMonth")} value={kpis.churned_this_month ?? 0} />
            <KpiCard label={t("ccActivePrivateLessons")} value={kpis.active_private_lessons ?? 0} />
          </div>

          {(kpis.enrolled_seats != null || kpis.total_capacity != null) && (
            <p className="log-meta" style={{ marginBottom: 16 }}>
              {t("ccSeats")}: {kpis.enrolled_seats ?? 0} / {kpis.total_capacity ?? 0}
            </p>
          )}

          <div className="dashboard-charts" style={{ marginBottom: 24 }}>
            <Card style={{ minHeight: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                {t("ccOccupancyTrend")}
              </div>
              {occupancyTrend.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={occupancyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="occupancy_pct" name={t("ccOccupancy")} stroke="#0077B6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t("ccHealthScore")}</div>
              <Badge variant={HEALTH_VARIANT[health.color] || "neutral"} style={{ fontSize: 18, padding: "8px 16px" }}>
                {health.score ?? "—"}
              </Badge>
              <div className="log-meta" style={{ textAlign: "center" }}>
                {t("ccOccupancy")}: {health.occupancy_pct ?? 0}%
                {" · "}{t("ccNewThisMonth")}: {health.new_count ?? 0}
                {" · "}{t("ccChurnedThisMonth")}: {health.churn_count ?? 0}
              </div>
            </Card>
          </div>
        </>
      )}

      <details className="cc-legacy-reports" open={!isDesktop}>
        <summary style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", cursor: "pointer", marginBottom: 12 }}>
          {t("ccLegacyReports")}
        </summary>

        <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <Field label={t("validFrom")} style={{ marginBottom: 0, minWidth: 140 }}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
          </Field>
          <Field label={t("validUntil")} style={{ marginBottom: 0, minWidth: 140 }}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
          </Field>
          <Field label={t("selectClass")} style={{ marginBottom: 0, minWidth: 180 }}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t("allProducts")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {legacyLoading ? (
          <div className="loading-center">{t("loading")}</div>
        ) : (
          <>
            <div className="dashboard-kpi-grid">
              <KpiCard label={t("dashboardTotalSessions")} value={summary.total_sessions ?? 0} />
              <KpiCard label={t("dashboardAttendanceRate")} value={`${summary.attendance_rate ?? 0}%`} />
              <KpiCard label={t("dashboardScanMarks")} value={summary.scan_marks ?? 0} />
              <KpiCard label={t("dashboardInstructorMarks")} value={summary.instructor_marks ?? 0} />
              <KpiCard label={t("dashboardUnpaid")} value={summary.unpaid_enrollments ?? 0} />
            </div>

            <div className="dashboard-charts">
              <Card style={{ minHeight: 280 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                  {t("dashboardWeeklyAttendance")}
                </div>
                {weekly.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={weekly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="attendance_rate" name={t("dashboardAttendanceRate")} stroke="#0077B6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                  {t("dashboardByProduct")}
                </div>
                {byProduct.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byProduct.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="product_name" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="present_count" name={t("attendancePresent")} fill="#0077B6" />
                      <Bar dataKey="absent_count" name={t("attendanceAbsent")} fill="#E17055" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t("dashboardByInstructor")}</div>
                  {byInstructor.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => exportReport("instructor")}>{t("exportCsv")}</Button>
                  )}
                </div>
                {byInstructor.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byInstructor.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="instructor_name" hide />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="present_count" name={t("attendancePresent")} fill="#00B894" />
                      <Bar dataKey="absent_count" name={t("attendanceAbsent")} fill="#E17055" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t("dashboardScanVsAttendance")}</div>
                  {scanVs.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => exportReport("scan")}>{t("exportCsv")}</Button>
                  )}
                </div>
                {scanVs.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={scanVs}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="scanned" name={t("dashboardScanMarks")} fill="#0077B6" />
                      <Bar dataKey="instructor_marked" name={t("dashboardInstructorMarks")} fill="#00B894" />
                      <Bar dataKey="expected" name={t("dashboardExpected")} fill="#E17055" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t("dashboardRevenueBySeason")}</div>
                  {revenue.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => exportReport("revenue")}>{t("exportCsv")}</Button>
                  )}
                </div>
                {revenue.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="season_name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="gross_revenue" name={t("dashboardGrossRevenue")} fill="#0077B6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                  {t("dashboardPaymentSplit")}
                </div>
                {enrollmentPie.length === 0 ? (
                  <div className="empty-text" style={{ padding: 24 }}>{t("noResults")}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={enrollmentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                        {enrollmentPie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card style={{ minHeight: 280 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                  {t("dashboardAssessmentFunnel")}
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                  {t("dashboardPassRate")}: {funnel.pass_rate ?? 0}%
                  {" · "}{t("dashboardSummerConversion")}: {funnel.summer_conversion ?? 0}%
                  {" · "}{t("dashboardClassConversion")}: {funnel.class_conversion ?? 0}%
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="stage" width={110} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#00B894" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </>
        )}
      </details>
    </div>
  );
}
