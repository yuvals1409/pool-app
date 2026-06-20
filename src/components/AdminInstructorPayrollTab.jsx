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
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "./ui/ds/index.js";

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
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabPayroll")}</h1>
          <p className="page-sub">{t("payrollSub")}</p>
        </div>
      )}

      <Card>
        <div className="crm-card-title">{t("payrollRates")}</div>
        <div className="filter-bar">
          <Select
            style={{ flex: 1, minWidth: 180 }}
            value={rateInstructorId}
            onChange={(e) => setRateInstructorId(e.target.value)}
          >
            <option value="">{t("payrollSelectInstructor")}</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.full_name || i.email}</option>
            ))}
          </Select>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!rateInstructorId || savingRates}
            onClick={saveRates}
          >
            {savingRates ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("save")}
          </Button>
        </div>
        {rateInstructorId && (
          <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: isDesktop ? "repeat(4, 1fr)" : "repeat(2, 1fr)" }}>
            {PAYROLL_TEMPLATE_CODES.map((code) => (
              <Field key={code} label={`${labelFor(code)} (${t("ratePerHour")})`}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={rates[code] ?? ""}
                  onChange={(e) => setRates((r) => ({ ...r, [code]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <Field label={t("fromDate")} style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("toDate")} style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t("instructor")} style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <Select value={filterInstructorId} onChange={(e) => setFilterInstructorId(e.target.value)}>
              <option value="">{t("allInstructors")}</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.full_name || i.email}</option>
              ))}
            </Select>
          </Field>
          <Button type="button" variant="secondary" size="sm" onClick={() => exportPayrollCsv(summary, t, labelFor)}>
            {t("exportCsv")}
          </Button>
        </div>
      </Card>

      {loading && !detailInstructor ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : summary.length === 0 ? (
        <EmptyState title={t("payrollNoData")} />
      ) : (
        <div className="grouped-list">
          {summary.map((inst) => (
            <Card key={inst.instructor_id} style={{ marginBottom: 12 }}>
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
                <Button type="button" variant="secondary" size="sm" onClick={() => showDetail(inst)}>
                  {t("payrollViewSessions")}
                </Button>
              </div>
              {(inst.by_template || []).length > 0 && (
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
                    {(inst.by_template || []).map((bt) => (
                      <tr key={bt.template_code}>
                        <td className="col-text">{labelFor(bt.template_code)}</td>
                        <td className="col-num">{bt.session_count}</td>
                        <td className="col-num">{bt.total_hours}</td>
                        <td className="col-num">{bt.rate_per_hour != null ? `₪${bt.rate_per_hour}` : "—"}</td>
                        <td className="col-num">{bt.total_pay != null ? `₪${bt.total_pay}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {detailInstructor && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="label">{t("payrollSessionDetail")}: {detailInstructor.instructor_name}</div>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setDetailInstructor(null); setDetailSessions([]); }}>
              {t("close")}
            </Button>
          </div>
          {detailSessions.length === 0 ? (
            <div className="empty-text">{t("payrollNoData")}</div>
          ) : (
            <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-date">{t("date")}</th>
                  <th className="col-date">{t("startTime")}</th>
                  <th className="col-text">{t("sessionTitle")}</th>
                  <th className="col-text">{t("payrollEntityType")}</th>
                  <th className="col-num">{t("payrollHours")}</th>
                  <th className="col-num">{t("totalPay")}</th>
                </tr>
              </thead>
              <tbody>
                {detailSessions.map((s) => (
                  <tr key={`${s.session_id}-${s.session_date}`}>
                    <td className="col-date">{fmtDateDay(s.session_date)}</td>
                    <td className="col-date" dir="ltr">{fmt_time(s.start_time)}</td>
                    <td className="col-text">{s.title}</td>
                    <td className="col-text col-text--mid">{labelFor(s.template_code)}</td>
                    <td className="col-num">{s.duration_hours}</td>
                    <td className="col-num">{s.pay_amount != null ? `₪${s.pay_amount}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
