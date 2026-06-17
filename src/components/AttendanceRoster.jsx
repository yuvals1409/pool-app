import { useState } from "react";
import { useLang } from "../i18n.jsx";
import {
  submitSessionAttendance,
  submitLessonAttendance,
} from "../lib/attendance.js";

const MARK_STATUSES = ["present", "absent"];

export default function AttendanceRoster({ session, roster, onSaved, onBack, toast }) {
  const { t } = useLang();
  const [marks, setMarks] = useState(() => buildInitialMarks(session, roster));
  const [saving, setSaving] = useState(false);

  const statusLabel = (s) => ({
    pending: t("attendancePending"),
    present: t("attendancePresent"),
    absent: t("attendanceAbsent"),
    excused: t("attendanceExcused"),
    late: t("attendanceLate"),
  }[s] || s);

  const setStatus = (key, status) => {
    setMarks((prev) => ({ ...prev, [key]: status }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (session.session_type === "private") {
        const data = await submitLessonAttendance(session.lesson_id, marks.lesson);
        if (data?.result !== "ok") throw new Error(t("systemError"));
      } else {
        const payload = Object.entries(marks)
          .filter(([k]) => k !== "lesson")
          .map(([enrollmentId, status]) => ({ enrollment_id: enrollmentId, status }));
        const data = await submitSessionAttendance(session.scheduled_session_id, payload);
        if (data?.result !== "ok") throw new Error(t("systemError"));
      }
      toast.show(t("attendanceSaved"));
      onSaved();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  const rows = session.session_type === "private"
    ? [{ key: "lesson", name: session.title, current: roster?.attendance_status }]
    : roster.map((r) => ({
        key: r.enrollment_id,
        name: r.child_name,
        current: r.attendance_status,
        source: r.attendance_source,
      }));

  return (
    <div>
      <button type="button" className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
        ← {t("backToSessions")}
      </button>

      <div className="grouped-list">
        {rows.map((row) => (
          <div className="user-row" key={row.key} style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="user-info" style={{ flex: 1 }}>
              <div className="user-display">{row.name}</div>
              {row.current && row.current !== "pending" && (
                <div className="user-email">
                  {statusLabel(marks[row.key] || row.current)}
                  {row.source === "guard_scan" ? ` · ${t("attendanceFromScan")}` : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {MARK_STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`btn btn-sm ${marks[row.key] === st ? (st === "present" ? "btn-primary" : "btn-danger") : "btn-outline"}`}
                  onClick={() => setStatus(row.key, st)}
                >
                  {statusLabel(st)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-primary mt-8" onClick={save} disabled={saving} style={{ width: "100%" }}>
        {saving ? <><div className="spinner" /> {t("saving")}</> : t("saveAttendance")}
      </button>
    </div>
  );
}

function buildInitialMarks(session, roster) {
  if (session.session_type === "private") {
    const st = roster?.attendance_status;
    return { lesson: st && st !== "pending" ? st : "present" };
  }
  const marks = {};
  for (const r of roster) {
    marks[r.enrollment_id] = r.attendance_status && r.attendance_status !== "pending"
      ? r.attendance_status
      : "present";
  }
  return marks;
}
