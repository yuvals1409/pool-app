import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import { supabase, ensureWeeklyLessonsGenerated, markLessonNotified } from "../lib/supabase.js";
import { canManage } from "../lib/permissions.js";
import { getWeekBounds, toLocalDateStr, fmt_time } from "../lib/lessonDates.js";
import { shareTicketViaWhatsApp } from "../lib/lessonNotify.js";
import { Button, EmptyState, Spinner } from "./ui/ds/index.js";

export default function PendingWeeklyBarcodes({ profile, toast, onSent, alwaysShow = false }) {
  const i18n = useLang();
  const { t, fmtDateDay } = i18n;
  const [pending, setPending] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureWeeklyLessonsGenerated();
    const { start, end } = getWeekBounds();
    let query = supabase.from("lessons").select("*")
      .not("recurring_lesson_id", "is", null)
      .is("notified_at", null)
      .eq("cancelled", false)
      .eq("used", false)
      .gte("lesson_date", toLocalDateStr(start))
      .lte("lesson_date", toLocalDateStr(end))
      .order("lesson_date", { ascending: true });
    if (!canManage(profile)) query = query.eq("instructor_id", profile.id);
    const { data } = await query;
    setPending(data || []);
    setLoading(false);
  }, [profile.id, profile.role]);

  useEffect(() => { load(); }, [load]);

  const sendOne = async (lesson) => {
    if (!lesson.parent_phone) return toast.show(t("phoneRequiredForNotify"));
    setSendingId(lesson.id);
    try {
      await shareTicketViaWhatsApp(lesson, lesson.parent_phone, toast, i18n);
      await markLessonNotified(lesson.id);
      toast.show(t("barcodeSent"));
      await load();
      onSent?.();
    } catch {
      toast.show(t("shareError"));
    }
    setSendingId(null);
  };

  const sendAll = async () => {
    if (!pending.length) return;
    setSending(true);
    for (const lesson of pending) {
      if (!lesson.parent_phone) continue;
      try {
        await shareTicketViaWhatsApp(lesson, lesson.parent_phone, toast, i18n);
        await markLessonNotified(lesson.id);
      } catch {
        toast.show(t("shareError"));
        break;
      }
    }
    toast.show(t("allBarcodesSent"));
    setSending(false);
    await load();
    onSent?.();
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner />
      </div>
    );
  }

  if (!pending.length) {
    if (!alwaysShow) return null;
    return <EmptyState title={t("pendingBarcodesEmpty")} />;
  }

  return (
    <div className={alwaysShow ? undefined : "pending-banner"}>
      {!alwaysShow ? (
        <>
          <div className="pending-banner-title">{t("pendingBarcodes")}</div>
          <div className="pending-banner-sub">{t("pendingBarcodesSub", { count: pending.length })}</div>
        </>
      ) : (
        <>
          <div className="section-sub" style={{ marginBottom: 12 }}>
            {t("pendingBarcodesSub", { count: pending.length })}
          </div>
        </>
      )}
      <Button
        fullWidth
        onClick={sendAll}
        disabled={sending || !!sendingId}
        style={{ background: "#25D366", borderColor: "#25D366", color: "#fff" }}
      >
        {sending ? <><Spinner size={16} color="#fff" /> {t("preparingImage")}</> : t("sendAllBarcodes")}
      </Button>
      <div style={{ marginTop: 14 }}>
        {pending.map((lesson) => (
          <div className="pending-item" key={lesson.id}>
            <div className="pending-item-info">
              <div className="pending-item-name">{lesson.child_name}</div>
              <div className="pending-item-meta">
                {fmtDateDay(lesson.lesson_date)} · {fmt_time(lesson.start_time)}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendOne(lesson)}
              disabled={sending || sendingId === lesson.id}
            >
              {sendingId === lesson.id ? "..." : t("sendBarcode")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
