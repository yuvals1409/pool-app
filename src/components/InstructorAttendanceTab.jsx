import { useState, useEffect, useCallback, useRef } from "react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  listInstructorSessions,
  getSessionAttendanceRoster,
  getLessonAttendance,
  templateLabel,
} from "../lib/attendance.js";
import AttendanceRoster from "./AttendanceRoster.jsx";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function InstructorAttendanceTab({ toast, initialFocus, onFocusHandled }) {
  const { t, fmtDateDay } = useLang();
  const [date, setDate] = useState(initialFocus?.date || todayStr());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const focusHandledRef = useRef(false);

  useEffect(() => {
    if (initialFocus?.date) setDate(initialFocus.date);
    focusHandledRef.current = false;
  }, [initialFocus]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInstructorSessions(date);
      setSessions(data);
      if (!initialFocus || focusHandledRef.current) {
        setActiveSession(null);
        setRoster(null);
      }
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [date, toast, t, initialFocus]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const openSession = useCallback(async (session) => {
    setActiveSession(session);
    setRosterLoading(true);
    try {
      if (session.session_type === "private") {
        const data = await getLessonAttendance(session.lesson_id);
        if (data?.result !== "ok") throw new Error(t("systemError"));
        setRoster(data);
      } else {
        const data = await getSessionAttendanceRoster(session.scheduled_session_id);
        setRoster(data);
      }
    } catch (e) {
      toast.show(e.message || t("systemError"));
      setActiveSession(null);
    }
    setRosterLoading(false);
  }, [toast, t]);

  useEffect(() => {
    if (!initialFocus || loading || focusHandledRef.current || sessions.length === 0) return;
    const match = sessions.find((s) => {
      if (initialFocus.lessonId) return s.lesson_id === initialFocus.lessonId;
      if (initialFocus.scheduledSessionId) {
        return s.scheduled_session_id === initialFocus.scheduledSessionId;
      }
      return false;
    });
    if (match) {
      focusHandledRef.current = true;
      openSession(match);
      onFocusHandled?.();
    }
  }, [initialFocus, loading, sessions, openSession, onFocusHandled]);

  if (activeSession) {
    if (rosterLoading) {
      return <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>;
    }
    return (
      <div>
        <div className="section-title">{activeSession.title}</div>
        <div className="section-sub" style={{ marginBottom: 16 }}>
          {fmtDateDay(activeSession.session_date)} · {fmt_time(activeSession.start_time)}
          {" · "}{templateLabel(t, activeSession.template_code)}
        </div>
        <AttendanceRoster
          session={activeSession}
          roster={roster}
          toast={toast}
          onBack={() => { setActiveSession(null); setRoster(null); }}
          onSaved={loadSessions}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">{t("tabAttendance")}</div>
      <div className="section-sub">{t("attendanceSub")}</div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="label">{t("date")}</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : sessions.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          <div className="empty-icon">📋</div>
          <div className="empty-text">{t("noSessionsForAttendance")}</div>
        </div>
      ) : (
        <div className="grouped-list" style={{ marginTop: 16 }}>
          {sessions.map((s) => (
            <button
              type="button"
              key={s.session_id}
              className="user-row"
              style={{ width: "100%", textAlign: "inherit", border: "none", background: "transparent", cursor: "pointer", flexWrap: "wrap", gap: 8 }}
              onClick={() => openSession(s)}
            >
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display">
                  {s.title}
                  <span className="badge badge-pending" style={{ marginInlineStart: 8 }}>
                    {templateLabel(t, s.template_code)}
                  </span>
                </div>
                <div className="user-email">
                  {fmt_time(s.start_time)}
                  {" · "}{t("attendanceMarkedCount", { marked: s.marked_count, total: s.expected_count })}
                </div>
              </div>
              <span className="btn btn-outline btn-sm">{t("markAttendance")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
