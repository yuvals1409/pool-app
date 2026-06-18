import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  listTodayAssessmentLeads,
  setAssessmentResult,
  getSummerInviteUrl,
} from "../lib/summerCourse.js";
import { shareTextViaWhatsApp } from "../lib/lessonNotify.js";

export default function InstructorAssessmentResults({ toast }) {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTodayAssessmentLeads();
      setRows(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const resultLabel = (r) => ({
    pending: t("assessmentResultPending"),
    passed: t("assessmentResultPassed"),
    failed: t("assessmentResultFailed"),
  }[r] || r);

  const leadStatusLabel = (status) => ({
    new: t("leadStatusNew"),
    call: t("leadStatusCall"),
    registered_assessment: t("leadStatusRegisteredAssessment"),
    passed: t("leadStatusPassed"),
    registered_class: t("leadStatusRegisteredClass"),
    abandoned: t("leadStatusAbandoned"),
  }[status] || status);

  const handleResult = async (row, result) => {
    setSavingId(row.lead_id);
    try {
      const data = await setAssessmentResult(row.lead_id, result);
      if (data?.result !== "ok") {
        toast.show(t("systemError"));
        setSavingId(null);
        return;
      }
      toast.show(result === "passed" ? t("assessmentMarkedPassed") : t("assessmentMarkedFailed"));
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingId(null);
  };

  const sendSummerLink = async (row, token) => {
    if (!row.parent_phone) return toast.show(t("phoneRequired"));
    const url = getSummerInviteUrl(token || row.summer_invite_token);
    const message = [
      t("waHello"),
      t("summerInviteMessage", { name: row.child_name }),
      "",
      url,
    ].join("\n");
    try {
      await shareTextViaWhatsApp(row.parent_phone, message);
      toast.show(t("summerLinkSent"));
    } catch {
      toast.show(t("shareError"));
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)" }}>{t("loading")}</div>;
  }

  if (!rows.length) {
    return (
      <div className="empty" style={{ marginBottom: 20 }}>
        <div className="empty-icon">📋</div>
        <div className="empty-text">{t("noAssessmentToday")}</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title" style={{ fontSize: 17 }}>{t("assessmentTodayTitle")}</div>
      <div className="section-sub" style={{ marginBottom: 12 }}>{t("assessmentTodaySub")}</div>
      <div className="grouped-list">
        {rows.map((row) => (
          <div className="user-row" key={row.lead_id} style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="user-info" style={{ flex: 1 }}>
              <div className="user-display">
                {row.child_name || "—"}
                <span className={`badge ${row.assessment_result === "passed" ? "badge-active" : row.assessment_result === "failed" ? "badge-used" : "badge-pending"}`} style={{ marginInlineStart: 8 }}>
                  {resultLabel(row.assessment_result)}
                </span>
              </div>
              <div className="user-email">
                {fmt_time(row.start_time)}
                {row.child_age != null ? ` · ${t("childAge")}: ${row.child_age}` : ""}
                {row.parent_phone ? ` · ${row.parent_phone}` : ""}
                {row.lead_status ? ` · ${leadStatusLabel(row.lead_status)}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {row.assessment_result === "pending" && (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={savingId === row.lead_id} onClick={() => handleResult(row, "passed")}>
                    {t("assessmentMarkPassed")}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={savingId === row.lead_id} onClick={() => handleResult(row, "failed")}>
                    {t("assessmentMarkFailed")}
                  </button>
                </>
              )}
              {row.assessment_result === "passed" && row.summer_invite_token && !row.invite_used_at && (
                <button type="button" className="btn btn-whatsapp btn-sm" onClick={() => sendSummerLink(row)}>
                  {t("sendSummerLink")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
