import { useState, useEffect, useCallback } from "react";
import "./schedule/schedule.css";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { listMakeupTargetSessions, bookMakeupSession } from "../lib/makeup.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import { templateLabel } from "../lib/attendance.js";
import { Badge, Button, Card, Field, Input, Spinner } from "./ui/ds/index.js";

export default function MakeupBookingModal({
  enrollment,
  utilization,
  onClose,
  onBooked,
  toast,
}) {
  const { t, fmtDateDay } = useLang();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [bookedPass, setBookedPass] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const loadSessions = useCallback(async () => {
    if (!enrollment?.id) return;
    setLoading(true);
    try {
      const data = await listMakeupTargetSessions(enrollment.id, today);
      setSessions(data);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [enrollment?.id, today, toast, t]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const book = async (sessionId) => {
    setSaving(true);
    setBookingId(sessionId);
    try {
      const data = await bookMakeupSession(enrollment.id, sessionId, { notes: notes.trim() || null });
      if (data?.result !== "ok") {
        const msg = {
          session_full: t("makeupSessionFull"),
          already_booked: t("makeupAlreadyBooked"),
          session_past: t("makeupSessionPast"),
          forbidden: t("noPermission"),
        }[data?.result] || t("systemError");
        toast.show(msg);
        return;
      }
      setBookedPass(data);
      toast.show(t("makeupBooked"));
      onBooked?.();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
    setBookingId(null);
  };

  const copyPassLink = async () => {
    if (!bookedPass?.public_token) return;
    const url = getPublicPassUrl(bookedPass.public_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("linkCopied"));
    } catch {
      toast.show(url);
    }
  };

  const childName = enrollment?.child_name || enrollment?.participant?.full_name;
  const productName = enrollment?.product_name || enrollment?.product?.name;
  const shortfall = utilization?.shortfall ?? enrollment?.shortfall ?? 0;

  return (
    <div className="schedule-panel-overlay" onClick={onClose}>
      <div className="schedule-panel" onClick={(e) => e.stopPropagation()}>
        <div className="schedule-panel-handle" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>{t("bookMakeup")}</div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{t("close")}</Button>
        </div>

        <div className="log-meta" style={{ marginBottom: 12 }}>
          {childName} · {productName}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Badge variant="warn">{t("utilizationEntitled")}: {utilization?.entitled ?? "—"}</Badge>
          <Badge variant="success">{t("utilizationUsed")}: {utilization?.utilized ?? "—"}</Badge>
          <Badge variant="danger">{t("utilizationShortfall")}: {shortfall}</Badge>
        </div>

        {bookedPass?.result === "ok" ? (
          <Card>
            <div className="log-name">{t("makeupBooked")}</div>
            <div className="log-meta">
              {fmtDateDay(bookedPass.session_date)} · {fmt_time(bookedPass.start_time)} · {bookedPass.product_name}
            </div>
            <Button type="button" variant="primary" size="sm" style={{ marginTop: 12 }} onClick={copyPassLink}>
              {t("copyTicketLink")}
            </Button>
          </Card>
        ) : (
          <>
            <Field label={t("makeupNotes")}>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("makeupNotesPlaceholder")} />
            </Field>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Spinner />
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: 16 }}>{t("noMakeupSessions")}</div>
            ) : (
              <div className="grouped-list" style={{ maxHeight: 360, overflowY: "auto" }}>
                {sessions.map((s) => (
                  <div className="user-row" key={s.session_id} style={{ flexWrap: "wrap", gap: 8 }}>
                    <div className="user-info" style={{ flex: 1 }}>
                      <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {s.product_name}
                        {s.level_match ? <Badge variant="success">{t("makeupLevelMatch")}</Badge> : null}
                      </div>
                      <div className="user-email">
                        {fmtDateDay(s.session_date)} · {fmt_time(s.start_time)}
                        {s.level_label ? ` · ${s.level_label}` : ""}
                        {s.instructor_name ? ` · ${s.instructor_name}` : ""}
                      </div>
                      <div className="user-email">
                        {templateLabel(t, s.template_code)}
                        {s.capacity != null ? ` · ${s.attendee_count}/${s.capacity}` : ""}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={saving}
                      onClick={() => book(s.session_id)}
                    >
                      {saving && bookingId === s.session_id ? "..." : t("bookMakeup")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
