import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { templateLabel } from "../lib/attendance.js";
import {
  PAYROLL_TEMPLATE_CODES,
  getInstructorWorkSessions,
  getInstructorPayrollSummary,
  listInstructorPayRates,
  upsertInstructorPayRate,
  currentMonthBounds,
} from "../lib/payroll.js";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";

function exportPayrollCsv(rows, t, templateLabelFn) {
  const header = [
    t("instructor"),
    t("payrollEntityType"),
    t("payrollSessions"),
    t("payrollHours"),
    t("ratePerHour"),
    t("totalPay"),
  ];
  const lines = [header.join(",")];
  for (const inst of rows) {
    for (const bt of inst.by_template || []) {
      lines.push([
        `"${(inst.instructor_name || "").replace(/"/g, '""')}"`,
        `"${templateLabelFn(bt.template_code).replace(/"/g, '""')}"`,
        bt.session_count ?? 0,
        bt.total_hours ?? 0,
        bt.rate_per_hour ?? "",
        bt.total_pay ?? "",
      ].join(","));
    }
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminInstructorPayrollTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const bounds = currentMonthBounds();
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [instructors, setInstructors] = useState([]);
  const [filterInstructorId, setFilterInstructorId] = useState("");
  const [rateInstructorId, setRateInstructorId] = useState("");
  const [rates, setRates] = useState({});
  const [savingRates, setSavingRates] = useState(false);
  const [summary, setSummary] = useState([]);
  const [detailSessions, setDetailSessions] = useState([]);
  const [detailInstructor, setDetailInstructor] = useState(null);
  const [loading, setLoading] = useState(false);

  const labelFor = useCallback((code) => templateLabel(t, code), [t]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "instructor")
        .eq("status", "approved")
        .order("full_name");
      setInstructors(data || []);
    })();
  }, []);

  const loadRates = useCallback(async (instructorId) => {
    if (!instructorId) {
      setRates({});
      return;
    }
    try {
      const rows = await listInstructorPayRates(instructorId);
      const map = {};
      for (const code of PAYROLL_TEMPLATE_CODES) map[code] = "";
      for (const r of rows) map[r.template_code] = String(r.rate_per_hour ?? "");
      setRates(map);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
  }, [toast, t]);

  useEffect(() => { loadRates(rateInstructorId); }, [rateInstructorId, loadRates]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInstructorPayrollSummary(
        from,
        to,
        filterInstructorId || null,
      );
      setSummary(data);
      setDetailSessions([]);
      setDetailInstructor(null);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [from, to, filterInstructorId, toast, t]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const saveRates = async () => {
    if (!rateInstructorId) return toast.show(t("payrollSelectInstructor"));
    setSavingRates(true);
    try {
      for (const code of PAYROLL_TEMPLATE_CODES) {
        const val = String(rates[code] ?? "").trim();
        if (!val) continue;
        const num = Number(val);
        if (Number.isNaN(num) || num < 0) {
          toast.show(t("payrollInvalidRate"));
          setSavingRates(false);
          return;
        }
        await upsertInstructorPayRate(rateInstructorId, code, num);
      }
      toast.show(t("payrollRatesSaved"));
      await loadRates(rateInstructorId);
      await loadSummary();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingRates(false);
  };

  const showDetail = async (inst) => {
    setDetailInstructor(inst);
    setLoading(true);
    try {
      const sessions = await getInstructorWorkSessions(from, to, inst.instructor_id);
      setDetailSessions(sessions);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t("tabPayroll")}</h1>
        <p className="page-sub">{t("payrollSub")}</p>
      </div>

      <div className="card">
        <div className="crm-card-title">{t("payrollRates")}</div>
        <div className="filter-bar">
          <select
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            value={rateInstructorId}
            onChange={(e) => setRateInstructorId(e.target.value)}
          >
            <option value="">{t("payrollSelectInstructor")}</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.full_name || i.email}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!rateInstructorId || savingRates}
            onClick={saveRates}
          >
            {savingRates ? <><div className="spinner" /> {t("saving")}</> : t("save")}
          </button>
        </div>
        {rateInstructorId && (
          <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: isDesktop ? "repeat(4, 1fr)" : "repeat(2, 1fr)" }}>
            {PAYROLL_TEMPLATE_CODES.map((code) => (
              <div key={code} className="field">
                <label className="label">{labelFor(code)} ({t("ratePerHour")})</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={rates[code] ?? ""}
                  onChange={(e) => setRates((r) => ({ ...r, [code]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label className="label">{t("fromDate")}</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label className="label">{t("toDate")}</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label className="label">{t("instructor")}</label>
            <select className="input" value={filterInstructorId} onChange={(e) => setFilterInstructorId(e.target.value)}>
              <option value="">{t("allInstructors")}</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.full_name || i.email}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => exportPayrollCsv(summary, t, labelFor)}>
            {t("exportCsv")}
          </button>
        </div>
      </div>

      {loading && !detailInstructor ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : summary.length === 0 ? (
        <div className="empty"><div className="empty-icon">💼</div><div className="empty-text">{t("payrollNoData")}</div></div>
      ) : (
        <div className="grouped-list">
          {summary.map((inst) => (
            <div key={inst.instructor_id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div>
                  <div className="log-name">{inst.instructor_name}</div>
                  <div className="log-meta">
                    {t("payrollHours")}: {inst.total_hours ?? 0}
                    {" · "}{t("totalPay")}: {inst.total_pay != null ? `₪${inst.total_pay}` : "—"}
                  </div>
                  {inst.missing_rates && (
                    <div className="log-meta" style={{ color: "var(--warning)" }}>{t("missingRate")}</div>
                  )}
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => showDetail(inst)}>
                  {t("payrollViewSessions")}
                </button>
              </div>
              {(inst.by_template || []).length > 0 && (
                <table className="data-table" style={{ width: "100%", fontSize: "var(--text-footnote)" }}>
                  <thead>
                    <tr>
                      <th>{t("payrollEntityType")}</th>
                      <th>{t("payrollSessions")}</th>
                      <th>{t("payrollHours")}</th>
                      <th>{t("ratePerHour")}</th>
                      <th>{t("totalPay")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inst.by_template || []).map((bt) => (
                      <tr key={bt.template_code}>
                        <td>{labelFor(bt.template_code)}</td>
                        <td>{bt.session_count}</td>
                        <td>{bt.total_hours}</td>
                        <td>{bt.rate_per_hour != null ? `₪${bt.rate_per_hour}` : "—"}</td>
                        <td>{bt.total_pay != null ? `₪${bt.total_pay}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {detailInstructor && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="label">{t("payrollSessionDetail")}: {detailInstructor.instructor_name}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDetailInstructor(null); setDetailSessions([]); }}>
              {t("close")}
            </button>
          </div>
          {detailSessions.length === 0 ? (
            <div className="empty-text">{t("payrollNoData")}</div>
          ) : (
            <table className="data-table" style={{ width: "100%", fontSize: "var(--text-footnote)" }}>
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>{t("startTime")}</th>
                  <th>{t("sessionTitle")}</th>
                  <th>{t("payrollEntityType")}</th>
                  <th>{t("payrollHours")}</th>
                  <th>{t("totalPay")}</th>
                </tr>
              </thead>
              <tbody>
                {detailSessions.map((s) => (
                  <tr key={`${s.session_id}-${s.session_date}`}>
                    <td>{fmtDateDay(s.session_date)}</td>
                    <td>{fmt_time(s.start_time)}</td>
                    <td>{s.title}</td>
                    <td>{labelFor(s.template_code)}</td>
                    <td>{s.duration_hours}</td>
                    <td>{s.pay_amount != null ? `₪${s.pay_amount}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
