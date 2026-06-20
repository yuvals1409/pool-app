import { useState, useEffect, useCallback, useRef } from "react";
import { ClipboardList } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  listInstructorSessions,
  getSessionAttendanceRoster,
  getLessonAttendance,
  templateLabel,
  resolveSessionTemplateCode,
} from "../lib/attendance.js";
import AttendanceRoster from "./AttendanceRoster.jsx";
import { Card, Badge, EmptyState, Spinner } from "./ui/ds/index.js";

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
      return (
        <div className="loading-center" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Spinner />
          {t("loading")}
        </div>
      );
    }
    return (
      <div>
        <div className="section-title">{activeSession.title}</div>
        <div className="section-sub">
          {fmtDateDay(activeSession.session_date)} · {fmt_time(activeSession.start_time)}
          {" · "}{templateLabel(t, resolveSessionTemplateCode(activeSession))}
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

      <div className="field">
        <label className="label">{t("date")}</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
      </div>

      {loading ? (
        <div className="loading-center" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Spinner />
          {t("loading")}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} strokeWidth={1.75} />}
          title={t("noSessionsForAttendance")}
        />
      ) : (
        <Card padded={false} style={{ overflow: "hidden" }}>
          {sessions.map((s) => {
            const typeLabel = templateLabel(t, resolveSessionTemplateCode(s));
            return (
            <button
              type="button"
              key={s.session_id}
              className="user-row session-list-btn"
              onClick={() => openSession(s)}
            >
              <div className="user-info" style={{ flex: 1 }}>
                {s.title ? <div className="user-display">{s.title}</div> : null}
                <div
                  className="user-email"
                  style={{ display: "flex", alignItems: "center", gap: 8, overflow: "visible" }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fmt_time(s.start_time)}
                    {" · "}{t("attendanceMarkedCount", { marked: s.marked_count, total: s.expected_count })}
                  </span>
                  {typeLabel ? (
                    <Badge variant="warn" style={{ flexShrink: 0 }}>
                      {typeLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <span className="btn btn-outline btn-sm" style={{ pointerEvents: "none" }}>{t("markAttendance")}</span>
            </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
