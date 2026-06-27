import { useState, useEffect } from "react";
import { X } from "lucide-react";
import "../styles/makeup-booking.css";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { listMakeupTargetSessions, bookMakeupSession } from "../lib/makeup.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import { templateLabel } from "../lib/attendance.js";
import { Badge, Button, Card, EmptyState, Field, Input, Spinner } from "./ui/ds/index.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function enrollmentIdOf(enrollment) {
  return enrollment?.id ?? enrollment?.enrollment_id ?? null;
}

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

  const enrollmentId = enrollmentIdOf(enrollment);
  const childName = enrollment?.child_name || enrollment?.participant?.full_name;
  const productName = enrollment?.product_name || enrollment?.product?.name;
  const shortfall = utilization?.shortfall ?? enrollment?.shortfall ?? 0;

  useEffect(() => {
    if (!enrollmentId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listMakeupTargetSessions(enrollmentId, todayStr());
        if (!cancelled) setSessions(data);
      } catch (e) {
        if (!cancelled) toast.show(e.message || t("systemError"));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [enrollmentId, toast, t]);

  const book = async (sessionId) => {
    if (!enrollmentId) return;
    setSaving(true);
    setBookingId(sessionId);
    try {
      const data = await bookMakeupSession(enrollmentId, sessionId, { notes: notes.trim() || null });
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

  return (
    <div className="makeup-modal-overlay" onClick={onClose}>
      <div className="makeup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="makeup-modal-title">
        <div className="makeup-modal-header">
          <h2 id="makeup-modal-title" className="makeup-modal-title">{t("bookMakeup")}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t("close")}>
            <X size={18} aria-hidden />
          </Button>
        </div>

        <div className="makeup-modal-body">
          <div className="makeup-modal-identity">
            {childName ? <div className="makeup-modal-child">{childName}</div> : null}
            {productName ? <div className="makeup-modal-product">{productName}</div> : null}
          </div>

          <div className="makeup-stats">
            <div className="makeup-stat makeup-stat--warn">
              <span className="makeup-stat-label">{t("utilizationEntitled")}</span>
              <span className="makeup-stat-value">{utilization?.entitled ?? "—"}</span>
            </div>
            <div className="makeup-stat makeup-stat--success">
              <span className="makeup-stat-label">{t("utilizationUsed")}</span>
              <span className="makeup-stat-value">{utilization?.utilized ?? "—"}</span>
            </div>
            <div className="makeup-stat makeup-stat--danger">
              <span className="makeup-stat-label">{t("utilizationShortfall")}</span>
              <span className="makeup-stat-value">{shortfall}</span>
            </div>
          </div>

          {bookedPass?.result === "ok" ? (
            <Card>
              <div className="makeup-success-card">
                <div className="makeup-success-title">{t("makeupBooked")}</div>
                <div className="makeup-success-meta">
                  {fmtDateDay(bookedPass.session_date)} · {fmt_time(bookedPass.start_time)} · {bookedPass.product_name}
                </div>
                <Button type="button" variant="primary" size="sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={copyPassLink}>
                  {t("copyTicketLink")}
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Field label={t("makeupNotes")}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("makeupNotesPlaceholder")} />
              </Field>

              {loading ? (
                <div className="makeup-loading">
                  <Spinner />
                  <span>{t("makeupLoadingSessions")}</span>
                </div>
              ) : sessions.length === 0 ? (
                <EmptyState title={t("noMakeupSessions")} style={{ padding: "24px 16px" }} />
              ) : (
                <>
                  <p className="makeup-section-title">{t("makeupChooseSession")}</p>
                  <div className="makeup-sessions">
                    {sessions.map((s) => (
                      <div className="makeup-session" key={s.session_id}>
                        <div className="makeup-session-info">
                          <div className="makeup-session-name">
                            {s.product_name}
                            {s.level_match ? <Badge variant="success">{t("makeupLevelMatch")}</Badge> : null}
                          </div>
                          <div className="makeup-session-meta">
                            {fmtDateDay(s.session_date)} · <span dir="ltr">{fmt_time(s.start_time)}</span>
                            {s.level_label ? ` · ${s.level_label}` : ""}
                            {s.instructor_name ? ` · ${s.instructor_name}` : ""}
                          </div>
                          <div className="makeup-session-detail">
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
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
