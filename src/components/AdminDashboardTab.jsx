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
  getEnrollmentStats,
  getAssessmentFunnel,
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
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({});
  const [weekly, setWeekly] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [enrollmentPie, setEnrollmentPie] = useState([]);
  const [funnel, setFunnel] = useState({});

  useEffect(() => {
    (async () => {
      const { data: season } = await supabase.from("seasons").select("id").eq("active", true).maybeSingle();
      if (!season) return;
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("season_id", season.id)
        .order("name");
      setProducts(data || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, week, prod, enroll, fun] = await Promise.all([
        getDashboardSummary(from, to),
        getAttendanceByWeek(from, to, productId || null),
        getAttendanceByProduct(from, to),
        getEnrollmentStats(),
        getAssessmentFunnel(from, to),
      ]);
      setSummary(sum);
      setWeekly(week.map((r) => ({
        ...r,
        label: String(r.week_start).slice(5),
      })));
      setByProduct(prod);
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
  }, [from, to, productId, toast, t]);

  useEffect(() => { load(); }, [load]);

  const funnelData = [
    { stage: t("dashboardFunnelRegistered"), count: funnel.registered || 0 },
    { stage: t("dashboardFunnelPassed"), count: funnel.passed || 0 },
    { stage: t("dashboardFunnelSummer"), count: funnel.summer_enrolled || 0 },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="stage" width={100} />
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
