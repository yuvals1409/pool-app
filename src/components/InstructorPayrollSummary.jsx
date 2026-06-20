import { useState, useEffect, useCallback } from "react";
import { templateLabel } from "../lib/attendance.js";
import {
  getInstructorPayrollSummary,
  monthBounds,
} from "../lib/payroll.js";
import { useLang } from "../i18n.jsx";

export default function InstructorPayrollSummary({ profile, toast }) {
  const { t } = useLang();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { from, to } = monthBounds(year, month);
    try {
      const data = await getInstructorPayrollSummary(from, to, profile.id);
      setSummary(data[0] || null);
    } catch (e) {
      toast.show(e.message || t("systemError"));
      setSummary(null);
    }
    setLoading(false);
  }, [profile?.id, year, month, toast, t]);

  useEffect(() => { load(); }, [load]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-title" style={{ fontSize: "var(--text-title3)", marginBottom: 4 }}>
        {t("payrollSummary")}
      </div>
      <div className="section-sub" style={{ marginBottom: 12 }}>{t("payrollSummarySub")}</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="input" style={{ width: 100 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select className="input" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 16, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : !summary ? (
        <div className="empty-text">{t("payrollNoData")}</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 12 }}>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("payrollHours")}</div>
              <div className="dashboard-kpi-value">{summary.total_hours ?? 0}</div>
            </div>
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-label">{t("totalPay")}</div>
              <div className="dashboard-kpi-value">
                {summary.total_pay != null ? `₪${summary.total_pay}` : "—"}
              </div>
            </div>
          </div>
          {summary.missing_rates && (
            <div className="info-box" style={{ marginBottom: 12 }}>{t("payrollMissingRateHint")}</div>
          )}
          {(summary.by_template || []).length > 0 ? (
            <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-text">{t("payrollEntityType")}</th>
                  <th className="col-num">{t("payrollSessions")}</th>
                  <th className="col-num">{t("payrollHours")}</th>
                  <th className="col-num">{t("ratePerHour")}</th>
                  <th className="col-num">{t("totalPay")}</th>
                </tr>
              </thead>
              <tbody>
                {(summary.by_template || []).map((bt) => (
                  <tr key={bt.template_code}>
                    <td className="col-text">{templateLabel(t, bt.template_code)}</td>
                    <td className="col-num">{bt.session_count}</td>
                    <td className="col-num">{bt.total_hours}</td>
                    <td className="col-num">{bt.rate_per_hour != null ? `₪${bt.rate_per_hour}` : "—"}</td>
                    <td className="col-num">{bt.total_pay != null ? `₪${bt.total_pay}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="empty-text">{t("payrollNoData")}</div>
          )}
        </>
      )}
    </div>
  );
}
