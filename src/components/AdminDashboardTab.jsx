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
import { useLang } from "../i18n.jsx";

const PIE_COLORS = ["#0077B6", "#E17055", "#00B894"];

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
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [productId, setProductId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [products, setProducts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
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
    setLoading(false);
  }, [from, to, productId, seasonId, toast, t]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <select className="input" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} style={{ minWidth: 120 }}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">{t("allProducts")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("dashboardTotalSessions")}</div>
              <div className="dashboard-kpi-value">{summary.total_sessions ?? 0}</div>
            </div>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("dashboardAttendanceRate")}</div>
              <div className="dashboard-kpi-value">{summary.attendance_rate ?? 0}%</div>
            </div>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("dashboardScanMarks")}</div>
              <div className="dashboard-kpi-value">{summary.scan_marks ?? 0}</div>
            </div>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("dashboardInstructorMarks")}</div>
              <div className="dashboard-kpi-value">{summary.instructor_marks ?? 0}</div>
            </div>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("dashboardUnpaid")}</div>
              <div className="dashboard-kpi-value">{summary.unpaid_enrollments ?? 0}</div>
            </div>
          </div>

          <div className="dashboard-charts">
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title">{t("dashboardWeeklyAttendance")}</div>
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
            </div>

            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title">{t("dashboardByProduct")}</div>
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
            </div>

            <div className="dashboard-chart-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="dashboard-chart-title">{t("dashboardByInstructor")}</div>
                {byInstructor.length > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => exportReport("instructor")}>{t("exportCsv")}</button>
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
            </div>

            <div className="dashboard-chart-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="dashboard-chart-title">{t("dashboardScanVsAttendance")}</div>
                {scanVs.length > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => exportReport("scan")}>{t("exportCsv")}</button>
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
            </div>

            <div className="dashboard-chart-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="dashboard-chart-title">{t("dashboardRevenueBySeason")}</div>
                {revenue.length > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => exportReport("revenue")}>{t("exportCsv")}</button>
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
            </div>

            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title">{t("dashboardPaymentSplit")}</div>
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
            </div>

            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title">{t("dashboardAssessmentFunnel")}</div>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
