import { useState } from "react";
import { useLang } from "../../i18n.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "../ui/AnimatedSheet.jsx";
import { fmt_time, isPastLesson } from "../../lib/lessonDates.js";
import { templateLabel } from "../../lib/attendance.js";
import { canManage } from "../../lib/permissions.js";
import {
  setSessionInstructorOverride,
  clearSessionInstructorOverride,
} from "../../lib/sessionSubstitutions.js";

export default function SessionSchedulePanel({
  event,
  profile,
  instructors = [],
  onClose,
  layout = "sheet",
  onMarkAttendance,
  showMarkAttendance,
  onSubstituteChange,
  toast,
}) {
  const { t, fmtDateDay } = useLang();
  const [substituteId, setSubstituteId] = useState(
    event.is_substitute ? event.instructor_id : ""
  );
  const [reason, setReason] = useState(
    event.is_substitute ? (event.substitute_reason || "") : ""
  );
  const [acting, setActing] = useState(false);

  const canSubstitute = canManage(profile);
  const past = isPastLesson(event);
  const sessionId = event.scheduled_session_id || event.session_id;

  const instructorDisplay = event.is_substitute
    ? t("substituteFor", {
        substitute: event.instructor_name,
        original: event.original_instructor_name,
      })
    : event.instructor_name;

  const availableSubstitutes = instructors.filter(
    (inst) => inst.id !== event.original_instructor_id
  );

  const handleSaveSubstitute = async () => {
    if (!substituteId) return toast?.show(t("selectInstructor"));
    if (substituteId === event.original_instructor_id) {
      return toast?.show(t("cannotSubstituteSelf"));
    }
    setActing(true);
    try {
      const data = await setSessionInstructorOverride(sessionId, substituteId, reason);
      if (data?.result === "forbidden") throw new Error(t("noPermission"));
      if (data?.result === "not_found") throw new Error(t("systemError"));
      if (data?.result === "invalid_substitute") throw new Error(t("selectInstructor"));
      if (data?.result === "assessment_not_allowed") throw new Error(t("systemError"));
      toast?.show(t("substituteSaved"));
      onSubstituteChange?.();
    } catch (e) {
      toast?.show(e.message || t("saveError"));
    }
    setActing(false);
  };

  const handleClearSubstitute = async () => {
    setActing(true);
    try {
      const data = await clearSessionInstructorOverride(sessionId);
      if (data?.result === "forbidden") throw new Error(t("noPermission"));
      toast?.show(t("substituteCleared"));
      onSubstituteChange?.();
    } catch (e) {
      toast?.show(e.message || t("saveError"));
    }
    setActing(false);
  };

  const content = (
      <div className="lesson-panel-view">
        {layout === "inline" && (
          <div className="schedule-rail-header">
            <div className="section-title" style={{ fontSize: 17, margin: 0 }}>
              {event.display_title || event.child_name}
            </div>
            <button type="button" className="schedule-rail-close" onClick={onClose} aria-label={t("cancel")}>✕</button>
          </div>
        )}
        <div className="lesson-info-row">
          <span className="li-key">{t("productType")}</span>
          <span className="li-val">{templateLabel(t, event.template_code)}</span>
        </div>
        <div className="lesson-info-row">
          <span className="li-key">{t("date")}</span>
          <span className="li-val">{fmtDateDay(event.lesson_date)}</span>
        </div>
        <div className="lesson-info-row">
          <span className="li-key">{t("startTime")}</span>
          <span className="li-val" dir="ltr">
            {fmt_time(event.start_time)}
            {event.end_time ? ` – ${fmt_time(event.end_time)}` : ""}
          </span>
        </div>
        {event.instructor_name && (
          <div className="lesson-info-row">
            <span className="li-key">{t("instructor")}</span>
            <span className="li-val">{instructorDisplay}</span>
          </div>
        )}
        {event.is_substitute && event.substitute_reason && (
          <div className="lesson-info-row">
            <span className="li-key">{t("substituteReason")}</span>
            <span className="li-val">{event.substitute_reason}</span>
          </div>
        )}
        {canSubstitute && !past && (
          <div className="substitute-form" style={{ marginTop: 16 }}>
            <div className="section-sub" style={{ marginBottom: 12 }}>{t("substituteInstructorHint")}</div>
            <div className="field">
              <label className="label">{t("substituteInstructor")}</label>
              <select
                className="input"
                value={substituteId}
                onChange={(e) => setSubstituteId(e.target.value)}
                disabled={acting}
              >
                <option value="">{t("selectInstructor")}</option>
                {availableSubstitutes.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.full_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">{t("substituteReason")}</label>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={acting}
                placeholder={t("substituteReasonPlaceholder")}
              />
            </div>
            <div className="gap-8">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveSubstitute}
                disabled={acting || !substituteId}
              >
                {acting ? <><div className="spinner" /> {t("saving")}</> : t("saveSubstitute")}
              </button>
              {event.is_substitute && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleClearSubstitute}
                  disabled={acting}
                >
                  {t("clearSubstitute")}
                </button>
              )}
            </div>
          </div>
        )}
        {canSubstitute && past && (
          <div className="schedule-readonly-hint" style={{ marginTop: 12 }}>{t("substitutePastSession")}</div>
        )}
        <p className="schedule-session-hint">{t("scheduleGroupSessionHint")}</p>
        {showMarkAttendance && onMarkAttendance && (
          <button type="button" className="btn btn-primary mt-8" style={{ width: "100%" }} onClick={() => onMarkAttendance(event)}>
            {t("markAttendance")}
          </button>
        )}
      </div>
  );

  if (layout === "inline") {
    return (
      <div className="schedule-rail-panel">
        {content}
      </div>
    );
  }

  return (
    <>
      <AnimatedSheetOverlay onClose={onClose} />
      <AnimatedSheetPanel onClose={onClose} title={event.display_title || event.child_name}>
        {content}
      </AnimatedSheetPanel>
    </>
  );
}
