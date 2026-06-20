import { useState } from "react";
import { useLang } from "../i18n.jsx";
import {
  submitSessionAttendance,
  submitLessonAttendance,
} from "../lib/attendance.js";
import { Button, Card, Badge, Input, Select, Spinner } from "./ui/ds/index.js";

const MARK_STATUSES = ["present", "absent", "excused", "late"];
const REASON_STATUSES = new Set(["excused", "late"]);
const REASON_OPTIONS = ["sickness", "vacation", "other"];

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

  const reasonLabel = (key) => ({
    sickness: t("attendanceReasonSickness"),
    vacation: t("attendanceReasonVacation"),
    other: t("attendanceReasonOther"),
  }[key] || key);

  const statusVariant = (st, selected) => {
    if (!selected) return "outline";
    if (st === "present") return "primary";
    if (st === "absent") return "danger";
    if (st === "excused") return "success";
    return "outline";
  };

  const updateMark = (key, patch) => {
    setMarks((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const setStatus = (key, status) => {
    setMarks((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status,
        reasonKey: REASON_STATUSES.has(status) ? prevReasonKey(prev[key]) : "",
        reasonText: REASON_STATUSES.has(status) ? prevReasonText(prev[key]) : "",
      },
    }));
  };

  const resolveNotes = (mark) => {
    if (!REASON_STATUSES.has(mark.status)) return null;
    if (mark.reasonKey === "other") return mark.reasonText.trim() || null;
    if (mark.reasonKey) return reasonLabel(mark.reasonKey);
    return null;
  };

  const save = async () => {
    for (const mark of Object.values(marks)) {
      if (REASON_STATUSES.has(mark.status) && !resolveNotes(mark)) {
        toast.show(t("attendanceReasonRequired"));
        return;
      }
    }

    setSaving(true);
    try {
      if (session.session_type === "private") {
        const mark = marks.lesson;
        const data = await submitLessonAttendance(session.lesson_id, mark.status, resolveNotes(mark));
        if (data?.result !== "ok") throw new Error(t("systemError"));
      } else {
        const payload = Object.entries(marks)
          .filter(([k]) => k !== "lesson")
          .map(([enrollmentId, mark]) => ({
            enrollment_id: enrollmentId,
            status: mark.status,
            notes: resolveNotes(mark),
          }));
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
        isMakeup: r.is_makeup || r.attendee_type === "makeup",
        homeProductName: r.home_product_name,
      }));

  return (
    <div>
      <Button size="sm" variant="outline" onClick={onBack} style={{ marginBottom: 12 }}>
        ← {t("backToSessions")}
      </Button>

      <Card padded={false} style={{ overflow: "hidden" }}>
        {rows.map((row) => {
          const mark = marks[row.key];
          const showReason = REASON_STATUSES.has(mark.status);
          return (
            <div className="user-row" key={row.key} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: "1 1 100%" }}>
                <div className="user-display">
                  {row.name}
                  {row.isMakeup && (
                    <Badge variant="success" style={{ marginInlineStart: 8 }}>{t("makeupBadge")}</Badge>
                  )}
                </div>
                {row.isMakeup && row.homeProductName && (
                  <div className="user-email">{t("makeupFromGroup")}: {row.homeProductName}</div>
                )}
                {row.current && row.current !== "pending" && (
                  <div className="user-email">
                    {statusLabel(mark.status || row.current)}
                    {row.source === "guard_scan" ? ` · ${t("attendanceFromScan")}` : ""}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "1 1 100%" }}>
                {MARK_STATUSES.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={statusVariant(st, mark.status === st)}
                    style={st === "late" && mark.status === st ? { background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" } : undefined}
                    onClick={() => setStatus(row.key, st)}
                  >
                    {statusLabel(st)}
                  </Button>
                ))}
              </div>
              {showReason && (
                <div className="field" style={{ flex: "1 1 100%", marginTop: 4 }}>
                  <label className="label">{t("attendanceReason")}</label>
                  <Select
                    value={mark.reasonKey}
                    onChange={(e) => updateMark(row.key, { reasonKey: e.target.value, reasonText: "" })}
                  >
                    <option value="">{t("selectReason")}</option>
                    {REASON_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{reasonLabel(opt)}</option>
                    ))}
                  </Select>
                  {mark.reasonKey === "other" && (
                    <Input
                      style={{ marginTop: 8 }}
                      value={mark.reasonText}
                      onChange={(e) => updateMark(row.key, { reasonText: e.target.value })}
                      placeholder={t("attendanceReasonCustomPlaceholder")}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Button fullWidth onClick={save} disabled={saving} style={{ marginTop: "var(--space-2)" }} icon={saving ? <Spinner color="#fff" /> : null}>
        {saving ? t("saving") : t("saveAttendance")}
      </Button>
    </div>
  );
}

function emptyMark(status = "present") {
  return { status, reasonKey: "", reasonText: "" };
}

function prevReasonKey(mark) {
  return mark?.reasonKey || "";
}

function prevReasonText(mark) {
  return mark?.reasonText || "";
}

function buildInitialMarks(session, roster) {
  if (session.session_type === "private") {
    const st = roster?.attendance_status;
    return { lesson: emptyMark(st && st !== "pending" ? st : "present") };
  }
  const marks = {};
  for (const r of roster) {
    marks[r.enrollment_id] = emptyMark(
      r.attendance_status && r.attendance_status !== "pending" ? r.attendance_status : "present",
    );
  }
  return marks;
}
