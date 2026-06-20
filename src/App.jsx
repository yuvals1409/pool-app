import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, XCircle, Plus } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import AnimatedToast from "./components/ui/AnimatedToast.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "./components/ui/AnimatedSheet.jsx";
import { TabIcon } from "./lib/tabIcons.jsx";
import { triggerScanFeedback } from "./lib/scanFeedback.js";
import { useLang, LanguageSwitcher, fmtDate as fmt_date } from "./i18n.jsx";
import {
  ADMIN_EMAIL, VENUE_MAPS_URL, VENUE_NAME, VENUE_ADDRESS,
  LESSON_DURATION_MINUTES, ENTRY_WINDOW_MINUTES,
} from "./lib/config.js";
import { supabase, ensureWeeklyLessonsGenerated, ensureWeeklySessionsGenerated, ensureAccessPassesGenerated, markLessonNotified } from "./lib/supabase.js";
import {
  isOwner, canManage, canEditSchedule,
  ACTIVE_USER_ROLE_ORDER, assignableRoles, canRevokeUser,
} from "./lib/permissions.js";
import {
  fmt_time, dateToDayOfWeek,
  parseLessonDateTime, addMinutes, isValidStartTime,
} from "./lib/lessonDates.js";
import {
  getLessonQrValue,
  shareTicketViaWhatsApp, shareCancellationViaWhatsApp,
} from "./lib/lessonNotify.js";
import { createAndNotify } from "./lib/lessonMutations.js";
import ParentContactPicker from "./components/ParentContactPicker.jsx";
import TimeScrollPicker from "./components/TimeScrollPicker.jsx";
import ScheduleTab from "./components/schedule/ScheduleTab.jsx";
import OfficeTab from "./components/OfficeTab.jsx";
import AdminEnrollmentsTab from "./components/AdminEnrollmentsTab.jsx";
import AdminAssessmentTab from "./components/AdminAssessmentTab.jsx";
import AdminProductsTab from "./components/AdminProductsTab.jsx";
import AdminSeasonsTab from "./components/AdminSeasonsTab.jsx";
import AdminAttendanceTab from "./components/AdminAttendanceTab.jsx";
import AdminAlertsTab from "./components/AdminAlertsTab.jsx";
import AdminOperationsTab from "./components/AdminOperationsTab.jsx";
import AdminHealthTab from "./components/AdminHealthTab.jsx";
import AdminMarketingTab from "./components/AdminMarketingTab.jsx";
import AdminUtilizationTab from "./components/AdminUtilizationTab.jsx";
import AdminDashboardTab from "./components/AdminDashboardTab.jsx";
import AdminStudentsTab from "./components/AdminStudentsTab.jsx";
import AdminFinanceTab from "./components/AdminFinanceTab.jsx";
import AdminPriceListTab from "./components/AdminPriceListTab.jsx";
import AdminInstructorsTab from "./components/AdminInstructorsTab.jsx";
import AdminSheetSyncTab from "./components/AdminSheetSyncTab.jsx";
import AdminWaitlistTab from "./components/AdminWaitlistTab.jsx";
import AdminInstructorPayrollTab from "./components/AdminInstructorPayrollTab.jsx";
import AdminCustomersTab from "./components/AdminCustomersTab.jsx";
import InstructorAttendanceTab from "./components/InstructorAttendanceTab.jsx";
import InstructorPersonalTab from "./components/InstructorPersonalTab.jsx";
import { StudentProfileProvider, useStudentProfile } from "./lib/StudentProfileContext.jsx";
import StudentProfilePanel from "./components/StudentProfilePanel.jsx";
import AssessmentRegisterPage from "./components/AssessmentRegisterPage.jsx";
import SummerRegisterPage from "./components/SummerRegisterPage.jsx";
import { parseAssessmentRegisterPath } from "./lib/assessment.js";
import { parseSummerRegisterPath } from "./lib/summerCourse.js";
import {
  lookupAndRedeemPass, fetchPublicPass, parsePublicPathToken, parseAccessLogReason,
} from "./lib/accessPass.js";
import { markLessonScanAttendance } from "./lib/attendance.js";
import { getOAuthRedirectUrl } from "./lib/authRedirect.js";
import { useIsDesktop } from "./lib/useBreakpoint.js";
import {
  getVisibleTabs,
  getAdminSections,
  getPlatformGate,
  sanitizeActiveTab,
  sanitizeAdminSection,
  personalSectionLabel,
} from "./lib/navigationPolicy.js";
import AppWorkspaceShell from "./components/layout/AppWorkspaceShell.jsx";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  NavItem,
  Select,
  Spinner,
} from "./components/ui/ds/index.js";

const PRIORITY_TABS = new Set(["schedule", "office", "admin", "personal"]);

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
async function lookupLessonByQr(value) {
  const { data: byToken } = await supabase.from("lessons").select("*").eq("qr_token", value).maybeSingle();
  if (byToken) return byToken;
  const { data: byId } = await supabase.from("lessons").select("*").eq("id", value).maybeSingle();
  if (byId && byId.qr_token === byId.id) return byId;
  return null;
}

function getEarliestEntryTime(lesson) {
  return addMinutes(parseLessonDateTime(lesson.lesson_date, lesson.start_time), -ENTRY_WINDOW_MINUTES);
}

function getLatestEntryTime(lesson) {
  return addMinutes(parseLessonDateTime(lesson.lesson_date, lesson.start_time), LESSON_DURATION_MINUTES);
}

function formatEntryFromTime(date, locale) {
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatIcsLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function escapeIcs(text) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildCalendarEvent(lesson, audience, { t, fmtDateDay }) {
  const start = parseLessonDateTime(lesson.lesson_date, lesson.start_time);
  const end = addMinutes(start, LESSON_DURATION_MINUTES);
  const title = t("calEventTitle", {
    name: audience === "instructor" ? lesson.child_name : lesson.instructor_name,
  });
  const description = [
    `${t("child")}: ${lesson.child_name}`,
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("duration")}: ${t("calDurationValue")}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
    VENUE_MAPS_URL,
  ].join("\n");
  return { title, description, start, end, location: `${VENUE_NAME}, ${VENUE_ADDRESS}` };
}

function buildIcsContent(event) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@pool-app`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Neve Oz Pool//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Jerusalem",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0200",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0300",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsLocal(new Date())}`,
    `DTSTART;TZID=Asia/Jerusalem:${formatIcsLocal(event.start)}`,
    `DTEND;TZID=Asia/Jerusalem:${formatIcsLocal(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildGoogleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatIcsLocal(event.start)}/${formatIcsLocal(event.end)}`,
    details: event.description,
    location: event.location,
    ctz: "Asia/Jerusalem",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function downloadIcs(event) {
  const blob = new Blob([buildIcsContent(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function addToCalendar(lesson, audience, i18n) {
  const event = buildCalendarEvent(lesson, audience, i18n);
  if (/Android/i.test(navigator.userAgent)) {
    window.open(buildGoogleCalendarUrl(event), "_blank");
    return;
  }
  downloadIcs(event);
}

const initials  = (name) => name ? name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";

function useToast() {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const t = useRef();
  const show = useCallback((text) => {
    setMsg(text); setVisible(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setVisible(false), 2800);
  }, []);
  return { msg, visible, show };
}

// ─────────────────────────────────────────────────────────────
//  LOGO + TICKET / QR
// ─────────────────────────────────────────────────────────────
const LOGO_SRC = "/stream-line-logo.jpeg";
const LOGO_FALLBACK = "/logo.png";

function BrandLogo({ height = 44 }) {
  const { t } = useLang();
  return (
    <img
      className="brand-logo"
      src={LOGO_SRC}
      alt={t("logoAlt")}
      style={{ height }}
      onError={(e) => { e.currentTarget.src = LOGO_FALLBACK; }}
    />
  );
}

function headerRoleBadgeClass(role, { owner = false, parent = false } = {}) {
  if (parent) return "badge-parent";
  if (owner) return "badge-owner";
  return {
    admin: "badge-admin",
    instructor: "badge-instructor",
    guard: "badge-guard",
    office: "badge-office",
  }[role] || "badge-pending";
}

function QRCanvas({ value, size = 220 }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && value)
      QRCode.toCanvas(ref.current, value, { width: size, margin: 2, color: { dark: "#012A4A", light: "#FFFFFF" } });
  }, [value, size]);
  return <canvas ref={ref} />;
}

function TicketCard({ lesson, qrSize = 200, label }) {
  const { t } = useLang();
  return (
    <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "var(--space-4) 0" }}>
      <BrandLogo height={52} />
      <div className="ticket-title">{t("ticketTitle")}</div>
      <QRCanvas value={getLessonQrValue(lesson)} size={qrSize} />
      <div className="qr-label">{label || t("ticketOneTime")}</div>
    </Card>
  );
}

function PassTicketCard({ qrToken, qrSize = 200, label }) {
  const { t } = useLang();
  return (
    <div className="qr-wrap">
      <BrandLogo height={52} />
      <div className="ticket-title">{t("annualTicket")}</div>
      <QRCanvas value={qrToken} size={qrSize} />
      <div className="qr-label">{label || t("showToGuard")}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  EDITABLE DISPLAY NAME
// ─────────────────────────────────────────────────────────────
function EditableDisplayName({ profile, onUpdate, toast }) {
  const { t, dir } = useLang();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.full_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(profile.full_name || ""); }, [profile.full_name]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.show(t("nicknameRequired"));
    setSaving(true);
    const { data, error } = await supabase.from("profiles")
      .update({ full_name: trimmed }).eq("id", profile.id).select().single();
    if (error) { toast.show(t("nicknameError")); setSaving(false); return; }
    onUpdate(data);
    setEditing(false);
    setSaving(false);
    toast.show(t("nicknameSaved"));
  };

  if (editing) return (
    <div className="name-edit">
      <input
        className="name-edit-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t("nicknamePlaceholder")}
        dir={dir}
        autoFocus
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(profile.full_name); setEditing(false); } }}
      />
      <button className="name-edit-btn" onClick={save} disabled={saving}>{saving ? "..." : t("save")}</button>
      <button className="name-edit-btn" onClick={() => { setName(profile.full_name); setEditing(false); }}>{t("cancel")}</button>
    </div>
  );

  return (
    <button type="button" className="user-name-btn" onClick={() => setEditing(true)} title={t("editNickname")}>
      <span>{profile.full_name}</span>
      <span style={{ fontSize: 11, opacity: 0.75 }}>✎</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  LOGIN PAGE
// ─────────────────────────────────────────────────────────────
function LoginPage({ toast }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const redirectTo = getOAuthRedirectUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) { toast.show(t("loginError")); setLoading(false); }
  };

  return (
    <div className="login-page">
      <LanguageSwitcher className="lang-switcher-login" compact />
      <div className="login-logo"><BrandLogo height={72} /></div>
      <div className="login-title">{t("loginTitle")}</div>
      <div className="login-sub">{t("loginSub")}<br />{t("loginContinue")}</div>
      <Card style={{ width: "100%", maxWidth: 360 }}>
        <Button
          variant="secondary"
          fullWidth
          onClick={signIn}
          disabled={loading}
          icon={loading ? <Spinner color="var(--pool)" /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 18, height: 18 }} />}
        >
          {loading ? t("signingIn") : t("signInGoogle")}
        </Button>
        <div style={{ marginTop: 20, fontSize: 12, color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.6 }}>
          {t("loginNote")}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PENDING PAGE
// ─────────────────────────────────────────────────────────────
function PendingPage({ user, onLogout }) {
  const { t } = useLang();
  return (
    <div className="pending-page">
      <LanguageSwitcher className="lang-switcher-login" compact />
      <div className="pending-icon">⏳</div>
      <div className="pending-title">{t("pendingTitle")}</div>
      <div className="pending-sub">{t("pendingSub", { email: user.email })}</div>
      <Button variant="outline" onClick={onLogout} style={{ marginTop: 32 }}>
        {t("logout")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  INSTRUCTOR TAB
// ─────────────────────────────────────────────────────────────
function InstructorTab({ profile, toast }) {
  const i18n = useLang();
  const { t, fmtDateDay, dir } = i18n;
  const blank = {
    child_name: "",
    lesson_date: "",
    start_time: "09:00",
    parent_phone: "",
    lesson_type: "once",
    lesson_format: "single",
    payment_status: "unpaid",
  };
  const [form, setForm]       = useState(blank);
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));

  useEffect(() => { ensureWeeklyLessonsGenerated(); }, []);

  const create = async () => {
    const { child_name, lesson_date, start_time, parent_phone, lesson_type } = form;
    if (!child_name || !lesson_date || !start_time || !parent_phone) return toast.show(t("fillAllFields"));
    if (!isValidStartTime(start_time)) return toast.show(t("invalidTime"));
    setLoading(true);
    const result = await createAndNotify({
      profile,
      form,
      toast,
      i18n,
    });
    if (result.error) {
      toast.show(`${t("createError")}: ${result.error.message}`);
    } else {
      setCreated(result.data);
      setForm(blank);
    }
    setLoading(false);
  };

  const sendWhatsApp = async () => {
    setSharing(true);
    try {
      await shareTicketViaWhatsApp(created, created.parent_phone, toast, i18n);
      await markLessonNotified(created.id);
    } catch {
      toast.show(t("shareError"));
    }
    setSharing(false);
  };

  if (created) return (
    <div>
      <div className="section-title">{t("barcodeReady")}</div>
      <div className="section-sub">{created.isRecurring ? t("barcodeReadySubRecurring") : t("barcodeReadySub")}</div>
      <TicketCard lesson={created} qrSize={200} />
      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{created.child_name}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(created.lesson_date)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(created.start_time)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{created.instructor_name}</span></div>
        {created.payment_status && (
          <div className="lesson-info-row">
            <span className="li-key">{t("lessonPaymentStatus")}</span>
            <span className="li-val">{{
              paid: t("paymentPaid"),
              unpaid: t("paymentUnpaid"),
              waived: t("paymentWaived"),
            }[created.payment_status] || created.payment_status}</span>
          </div>
        )}
        {created.price != null && (
          <div className="lesson-info-row"><span className="li-key">{t("lessonPrice")}</span><span className="li-val" dir="ltr">{created.price}</span></div>
        )}
      </div>
      <div className="gap-8">
        <Button
          fullWidth
          onClick={sendWhatsApp}
          disabled={sharing}
          style={{ background: "#25D366", color: "#fff", border: "1px solid #25D366" }}
          icon={sharing ? <Spinner color="#fff" /> : null}
        >
          {sharing ? t("preparingImage") : t("sendWhatsApp")}
        </Button>
        <Button variant="outline" fullWidth onClick={() => addToCalendar(created, "instructor", i18n)}>
          📅 {t("addToCalendar")}
        </Button>
        <Button variant="outline" fullWidth onClick={() => setCreated(null)}>+ {t("createAnother")}</Button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-title">{t("newLesson")}</div>
      <div className="section-sub">{t("newLessonSub")}</div>
      <Card style={{ marginBottom: "var(--space-4)" }}>
        <div className="field"><label className="label">{t("childName")}</label>
          <input className="input" placeholder={t("childPlaceholder")} value={form.child_name} onChange={upd("child_name")} dir={dir} /></div>
        <div className="field"><label className="label">{t("lessonDate")}</label>
          <div className="date-input-wrap">
            <input className="input" type="date" dir="ltr" value={form.lesson_date} onChange={upd("lesson_date")} />
          </div>
          {form.lesson_date && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>{fmtDateDay(form.lesson_date)}</div>
          )}
        </div>
        <div className="field"><label className="label">{t("lessonStartTime")}</label>
          <TimeScrollPicker value={form.start_time} onChange={v => setForm(f => ({ ...f, start_time: v }))} />
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>{t("timeHint")}</div>
        </div>
        <div className="field">
          <label className="label">{t("lessonType")}</label>
          <div className="mode-switch" style={{ marginBottom: 0 }}>
            <button type="button" className={`mode-btn ${form.lesson_type === "once" ? "active" : ""}`}
              onClick={() => setForm(f => ({ ...f, lesson_type: "once" }))}>
              {t("lessonOnce")}
            </button>
            <button type="button" className={`mode-btn ${form.lesson_type === "recurring" ? "active" : ""}`}
              onClick={() => setForm(f => ({ ...f, lesson_type: "recurring" }))}>
              {t("lessonRecurring")}
            </button>
          </div>
          {form.lesson_type === "recurring" && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.5 }}>
              {t("recurringFirstLessonHint")}
            </div>
          )}
        </div>
        <div className="field">
          <label className="label">{t("privateLessonFormat")}</label>
          <div className="mode-switch" style={{ marginBottom: 0 }}>
            <button type="button" className={`mode-btn ${form.lesson_format === "single" ? "active" : ""}`}
              onClick={() => setForm(f => ({ ...f, lesson_format: "single" }))}>
              {t("privateLessonSingle")}
            </button>
            <button type="button" className={`mode-btn ${form.lesson_format === "double" ? "active" : ""}`}
              onClick={() => setForm(f => ({ ...f, lesson_format: "double" }))}>
              {t("privateLessonDouble")}
            </button>
          </div>
        </div>
        <div className="field">
          <label className="label">{t("lessonPaymentStatus")}</label>
          <select className="input" value={form.payment_status} onChange={upd("payment_status")}>
            <option value="unpaid">{t("paymentUnpaid")}</option>
            <option value="paid">{t("paymentPaid")}</option>
            <option value="waived">{t("paymentWaived")}</option>
          </select>
        </div>
        <div className="field"><label className="label">{t("parentPhone")}</label>
          <ParentContactPicker
            value={form.parent_phone}
            onChange={phone => setForm(f => ({ ...f, parent_phone: phone }))}
            onError={msg => toast.show(msg)}
          />
        </div>
        <Button
          fullWidth
          onClick={create}
          disabled={loading}
          style={{ marginTop: "var(--space-2)" }}
          icon={loading ? <Spinner color="#fff" /> : null}
        >
          {loading ? t("creating") : t("createBarcode")}
        </Button>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  GUARD TAB
// ─────────────────────────────────────────────────────────────
function redeemPassMessage(redeem, t, locale) {
  switch (redeem.result) {
    case "unpaid": return t("entryUnpaid");
    case "already_used":
      return redeem.usedAt
        ? `${t("passAlreadyUsed")}\n${t("scannedOn")}: ${new Date(redeem.usedAt).toLocaleString(locale)}`
        : t("passAlreadyUsed");
    case "too_early":
      return t("entryTooEarly", { time: formatEntryFromTime(new Date(redeem.validFrom), locale) });
    case "too_late":
      return t("entryTooLate", { time: formatEntryFromTime(new Date(redeem.validUntil), locale) });
    case "cancelled": return t("passCancelled");
    case "inactive": return t("passInactive");
    case "expired": return t("passExpired");
    default: return t("barcodeNotFound");
  }
}

function ScanResultCard({ result, t, fmtDateDay }) {
  const reduced = useReducedMotion();
  const Icon = result.ok ? CheckCircle2 : XCircle;
  const display = result.lesson || result.pass;
  return (
    <motion.div
      className={`result-card ${result.ok ? "ok" : "err"}`}
      initial={{ scale: reduced ? 1 : 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduced ? { duration: 0.01 } : { type: "spring", stiffness: 400, damping: 30, bounce: 0.15 }}
    >
      <div className="result-icon" aria-hidden>
        <Icon size={52} strokeWidth={1.75} color={result.ok ? "var(--success)" : "var(--danger)"} />
      </div>
      <div className="result-title">{result.ok ? t("entryApproved") : t("entryDenied")}</div>
      {result.ok && display && (
        <div className="lesson-info" style={{ marginTop: 12 }}>
          <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{display.child_name || display.childName}</span></div>
          <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(display.lesson_date || display.sessionDate)}</span></div>
          <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(display.start_time || display.startTime)}</span></div>
          {display.product_name || display.productName ? (
            <div className="lesson-info-row"><span className="li-key">{t("sectionClass")}</span><span className="li-val">{display.product_name || display.productName}</span></div>
          ) : null}
          <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{display.instructor_name || display.instructorName}</span></div>
        </div>
      )}
      {!result.ok && <div className="result-detail">{result.msg}</div>}
    </motion.div>
  );
}

function GuardTab({ toast }) {
  const { t, fmtDateDay, locale } = useLang();
  const videoRef = useRef(); const canvasRef = useRef(); const animRef = useRef(); const streamRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState(null);
  const [flash,    setFlash]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [log,      setLog]      = useState([]);
  const [logOpen,  setLogOpen]  = useState(false);

  useEffect(() => { loadLog(); }, []);
  useEffect(() => {
    ensureWeeklySessionsGenerated();
    ensureAccessPassesGenerated();
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const loadLog = async () => {
    const [{ data: lessons }, { data: logs }] = await Promise.all([
      supabase.from("lessons").select("*")
        .eq("used", true).order("used_at", { ascending: false }).limit(15),
      supabase.from("access_logs").select("*")
        .eq("result", "ok").order("scanned_at", { ascending: false }).limit(15),
    ]);
    const passRows = (logs || []).map((l) => {
      const meta = parseAccessLogReason(l.reason) || {};
      return {
        id: `pass-${l.id}`,
        child_name: meta.child_name || "—",
        lesson_date: meta.session_date,
        start_time: meta.start_time,
        instructor_name: meta.instructor_name || meta.product_name || "",
        used_at: l.scanned_at,
      };
    });
    const lessonRows = lessons || [];
    const merged = [...lessonRows, ...passRows]
      .sort((a, b) => new Date(b.used_at) - new Date(a.used_at))
      .slice(0, 15);
    setLog(merged);
  };

  const ensureCamera = async () => {
    const live = streamRef.current?.getVideoTracks().some((track) => track.readyState === "live");
    if (live) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    streamRef.current = stream;
    return stream;
  };

  const startScan = async () => {
    setResult(null); setScanning(true);
    try {
      const stream = await ensureCamera();
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      requestAnimationFrame(tick);
    } catch { toast.show(t("noCamera")); setScanning(false); }
  };

  const pauseScan = () => {
    cancelAnimationFrame(animRef.current);
    setScanning(false);
  };

  const tick = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c || v.readyState !== v.HAVE_ENOUGH_DATA) { animRef.current = requestAnimationFrame(tick); return; }
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d"); ctx.drawImage(v,0,0);
    const img = ctx.getImageData(0,0,c.width,c.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code) processQR(code.data); else animRef.current = requestAnimationFrame(tick);
  };

  const showScanResult = (scanResult) => {
    setResult(scanResult);
    setFlash(scanResult.ok ? "ok" : "err");
    triggerScanFeedback(scanResult.ok);
    setTimeout(() => setFlash(null), 350);
  };

  const processQR = async (uuid) => {
    pauseScan(); setLoading(true);
    try {
      const lesson = await lookupLessonByQr(uuid);
      if (lesson) {
        if (lesson.cancelled) { showScanResult({ ok: false, lesson, msg: t("barcodeCancelled") }); setLoading(false); return; }
        if (lesson.used) {
          showScanResult({ ok: false, lesson, msg: `${t("barcodeUsed")}\n${t("scannedOn")}: ${new Date(lesson.used_at).toLocaleString(locale)}` });
          setLoading(false);
          return;
        }
        const earliestEntry = getEarliestEntryTime(lesson);
        const latestEntry = getLatestEntryTime(lesson);
        const now = new Date();
        if (now < earliestEntry) {
          showScanResult({ ok: false, lesson, msg: t("entryTooEarly", { time: formatEntryFromTime(earliestEntry, locale) }) });
          setLoading(false);
          return;
        }
        if (now > latestEntry) {
          showScanResult({ ok: false, lesson, msg: t("entryTooLate", { time: formatEntryFromTime(latestEntry, locale) }) });
          setLoading(false);
          return;
        }
        const { error: upErr } = await supabase.from("lessons").update({ used: true, used_at: new Date().toISOString() }).eq("id", lesson.id);
        if (upErr) throw upErr;
        await markLessonScanAttendance(lesson.id);
        showScanResult({ ok: true, lesson });
        loadLog();
        setLoading(false);
        return;
      }

      const redeem = await lookupAndRedeemPass(uuid);
      if (redeem.ok) {
        showScanResult({
          ok: true,
          pass: {
            childName: redeem.childName,
            sessionDate: redeem.sessionDate,
            startTime: redeem.startTime,
            productName: redeem.productName,
            instructorName: redeem.instructorName,
          },
        });
        loadLog();
      } else if (redeem.result === "not_found") {
        showScanResult({ ok: false, msg: t("barcodeNotFound") });
      } else {
        showScanResult({ ok: false, msg: redeemPassMessage(redeem, t, locale) });
      }
    } catch { showScanResult({ ok: false, msg: t("systemError") }); }
    setLoading(false);
  };

  return (
    <div>
      <AnimatePresence>
        {flash && <motion.div className={`scan-flash ${flash}`} initial={{ opacity: 0.85 }} exit={{ opacity: 0 }} aria-hidden />}
      </AnimatePresence>

      <div className="section-title">{t("poolEntry")}</div>
      <div className="section-sub">{t("scanSub")}</div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--ink-mid)", fontWeight: 600 }}>⏳ {t("verifying")}</div>}

      {!scanning && !loading && !result && (
        <Button size="lg" fullWidth onClick={startScan}>{t("scanBarcode")}</Button>
      )}

      {scanning && (
        <>
          <div className="scanner-wrap">
            <video ref={videoRef} playsInline muted style={{ display: "block" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div className="scan-overlay"><div className="scan-line" /></div>
          </div>
          <div className="scan-hint">{t("scanHint")}</div>
          <Button variant="outline" fullWidth onClick={pauseScan} style={{ marginTop: "var(--space-2)" }}>{t("cancel")}</Button>
        </>
      )}

      {result && !loading && (
        <>
          <ScanResultCard result={result} t={t} fmtDateDay={fmtDateDay} />
          <Button variant="outline" fullWidth onClick={() => setResult(null)}>{t("scanAnother")}</Button>
        </>
      )}

      {log.length > 0 && (
        <Button variant="outline" fullWidth className="guard-log-toggle" onClick={() => setLogOpen(true)}>
          {t("recentEntries")} ({log.length})
        </Button>
      )}

      <AnimatePresence>
        {logOpen && (
          <AnimatedSheetOverlay onClose={() => setLogOpen(false)}>
            <AnimatedSheetPanel onClick={e => e.stopPropagation()}>
              <div className="schedule-panel-handle" />
              <div className="section-title" style={{ fontSize: 17 }}>{t("recentEntries")}</div>
              <div className="grouped-list" style={{ marginTop: 16 }}>
                {log.slice(0, 15).map(l => (
                  <div className="log-item" key={l.id}>
                    <div className="log-dot" style={{ background: "var(--success)" }} />
                    <div>
                      <div className="log-name">{l.child_name}</div>
                      <div className="log-meta">{fmtDateDay(l.lesson_date)} · {fmt_time(l.start_time)} · {l.instructor_name}</div>
                      <div className="log-meta">{t("scannedAt")}: {new Date(l.used_at).toLocaleTimeString(locale)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="secondary" fullWidth style={{ marginTop: 16 }} onClick={() => setLogOpen(false)}>{t("cancel")}</Button>
            </AnimatedSheetPanel>
          </AnimatedSheetOverlay>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ADMIN TAB
// ─────────────────────────────────────────────────────────────
function roleBadgeVariant(role) {
  if (role === "admin") return "admin";
  if (role === "instructor") return "instructor";
  return "neutral";
}

function AdminStudentProfileHost({ toast }) {
  const { participantId, closeProfile } = useStudentProfile();
  return (
    <StudentProfilePanel
      participantId={participantId}
      open={!!participantId}
      onClose={closeProfile}
      toast={toast}
    />
  );
}

function AdminTab({ profile, toast, adminSection, onAdminSectionChange }) {
  const { t, roleLabel } = useLang();
  const isDesktop = useIsDesktop();
  const setAdminSection = onAdminSectionChange;
  const [users,    setUsers]    = useState([]);
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [email,      setEmail]      = useState("");
  const [role,       setRole]       = useState("instructor");
  const [openRoles,  setOpenRoles]  = useState(() => new Set());
  const [hiredAtEdits, setHiredAtEdits] = useState({});
  const [savingHiredAtId, setSavingHiredAtId] = useState(null);

  const roles = assignableRoles(profile);

  const toggleRoleSection = (roleKey) => {
    setOpenRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleKey)) next.delete(roleKey);
      else next.add(roleKey);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [{ data: usersData }, { data: invitesData }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("role_assignments").select("*").order("created_at", { ascending: false }),
    ]);
    setUsers(usersData || []);
    setInvites(invitesData || []);
    const hiredMap = {};
    for (const u of usersData || []) {
      if (u.hired_at) hiredMap[u.id] = u.hired_at;
    }
    setHiredAtEdits(hiredMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (roles.length && !roles.includes(role)) setRole(roles[0]); }, [roles, role]);

  const assignUser = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      return toast.show(t("invalidEmail"));
    if (normalized === ADMIN_EMAIL)
      return toast.show(t("ownerPreset"));
    if (!roles.includes(role))
      return toast.show(t("noPermission"));

    setSaving(true);
    const { error: inviteErr } = await supabase.from("role_assignments").upsert({ email: normalized, role });
    if (inviteErr) {
      toast.show(`${t("saveError")}: ${inviteErr.message}`);
      setSaving(false);
      return;
    }

    const { data: existing } = await supabase.from("profiles").select("*").ilike("email", normalized).maybeSingle();
    if (existing) {
      const { error: profileErr } = await supabase.from("profiles")
        .update({ status: "approved", role })
        .eq("id", existing.id);
      if (profileErr) {
        toast.show(`${t("profileError")}: ${profileErr.message}`);
        setSaving(false);
        return;
      }
    }

    toast.show(t("assignedRole", { role: roleLabel(role), email: normalized }));
    setEmail("");
    setSaving(false);
    load();
  };

  const revoke = async (target) => {
    if (!canRevokeUser(profile, target)) return;
    const label = target.full_name || target.email;
    if (!confirm(t("revokeConfirm", { name: label }))) return;

    await supabase.from("role_assignments").delete().eq("email", target.email.toLowerCase());
    if (target.id) {
      await supabase.from("profiles").update({ status: "pending", role: null }).eq("id", target.id);
    }
    toast.show(t("accessRevoked"));
    load();
  };

  const saveHiredAt = async (user) => {
    if (!canManage(profile)) return;
    const value = hiredAtEdits[user.id] || null;
    setSavingHiredAtId(user.id);
    const { error } = await supabase.from("profiles").update({ hired_at: value || null }).eq("id", user.id);
    if (error) toast.show(error.message);
    else toast.show(t("hiredAtUpdated"));
    setSavingHiredAtId(null);
    load();
  };

  const approved = users.filter(u => u.status === "approved" && u.role);
  const approvedEmails = new Set(approved.map(u => u.email?.toLowerCase()));
  const waitingInvites = invites.filter(i => !approvedEmails.has(i.email?.toLowerCase()));
  const approvedByRole = ACTIVE_USER_ROLE_ORDER
    .map(r => ({ role: r, users: approved.filter(u => u.role === r) }))
    .filter(g => g.users.length > 0);

  const renderUserRow = (u, key) => (
    <Card
      key={key}
      style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}
    >
      <Avatar name={u.full_name || u.email} src={u.avatar_url} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: "var(--ink)" }}>
          {u.full_name || "—"}
          {isOwner(u) && (
            <Badge variant={roleBadgeVariant(u.role)}>{roleLabel(u.role, true)}</Badge>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }} dir="ltr">{u.email}</div>
        {u.role === "instructor" && canManage(profile) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("hiredAt")}</span>
            <Input
              type="date"
              dir="ltr"
              value={hiredAtEdits[u.id] || ""}
              onChange={(e) => setHiredAtEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
              style={{ width: 150, minHeight: 32, height: 32 }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={savingHiredAtId === u.id}
              onClick={() => saveHiredAt(u)}
            >
              {t("save")}
            </Button>
          </div>
        )}
      </div>
      {canRevokeUser(profile, u) && (
        <Button variant="danger" size="sm" onClick={() => revoke(u)}>{t("revoke")}</Button>
      )}
    </Card>
  );

  const adminSections = [
    { id: "customers", label: t("tabCustomers") },
    { id: "users", label: t("adminSectionUsers") },
    { id: "enrollments", label: t("tabEnrollments") },
    { id: "products", label: t("tabProducts") },
    { id: "pricelist", label: t("tabPriceList") },
    { id: "seasons", label: t("tabSeasons") },
    { id: "assessment", label: t("tabAssessment") },
    { id: "marketing", label: t("tabMarketing") },
    { id: "attendance", label: t("tabAttendance") },
    { id: "alerts", label: t("tabAlerts") },
    { id: "operations", label: t("tabOperations") },
    { id: "utilization", label: t("tabUtilization") },
    { id: "waitlist", label: t("tabWaitlist") },
    { id: "dashboard", label: t("tabDashboard") },
    { id: "health", label: t("tabHealth") },
    { id: "students", label: t("tabStudents") },
    { id: "finance", label: t("tabFinance") },
    { id: "instructors", label: t("tabInstructorsAnalytics") },
    { id: "payroll", label: t("tabPayroll") },
    { id: "sheets", label: t("tabSheetSync") },
  ].filter((section) => getAdminSections(profile, isDesktop).includes(section.id));

  return (
    <StudentProfileProvider>
    <div>
      <div className="admin-shell">
        {isDesktop && (
          <aside className="admin-rail" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {adminSections.map((section) => (
              <NavItem
                key={section.id}
                label={section.label}
                active={adminSection === section.id}
                onClick={() => setAdminSection(section.id)}
              />
            ))}
          </aside>
        )}

        <div className="admin-content">
          {!isDesktop && (
            <div className="admin-nav-mobile" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
              {adminSections.map((section) => (
                <Button
                  key={section.id}
                  size="sm"
                  variant={adminSection === section.id ? "secondary" : "ghost"}
                  onClick={() => setAdminSection(section.id)}
                  style={{ flexShrink: 0 }}
                >
                  {section.label}
                </Button>
              ))}
            </div>
          )}

      {adminSection === "customers" ? (
        <AdminCustomersTab toast={toast} />
      ) : adminSection === "enrollments" ? (
        <AdminEnrollmentsTab toast={toast} />
      ) : adminSection === "products" ? (
        <AdminProductsTab toast={toast} />
      ) : adminSection === "pricelist" ? (
        <AdminPriceListTab toast={toast} profile={profile} />
      ) : adminSection === "seasons" ? (
        <AdminSeasonsTab toast={toast} />
      ) : adminSection === "assessment" ? (
        <AdminAssessmentTab toast={toast} />
      ) : adminSection === "marketing" ? (
        <AdminMarketingTab toast={toast} />
      ) : adminSection === "attendance" ? (
        <AdminAttendanceTab toast={toast} />
      ) : adminSection === "alerts" ? (
        <AdminAlertsTab toast={toast} />
      ) : adminSection === "operations" ? (
        <AdminOperationsTab toast={toast} onOpenUtilization={() => onAdminSectionChange("utilization")} />
      ) : adminSection === "utilization" ? (
        <AdminUtilizationTab toast={toast} />
      ) : adminSection === "dashboard" ? (
        <AdminDashboardTab toast={toast} onOpenHealth={() => onAdminSectionChange("health")} />
      ) : adminSection === "health" ? (
        <AdminHealthTab toast={toast} />
      ) : adminSection === "students" ? (
        <AdminStudentsTab toast={toast} />
      ) : adminSection === "finance" ? (
        <AdminFinanceTab toast={toast} />
      ) : adminSection === "instructors" ? (
        <AdminInstructorsTab toast={toast} />
      ) : adminSection === "payroll" ? (
        <AdminInstructorPayrollTab toast={toast} />
      ) : adminSection === "waitlist" ? (
        <AdminWaitlistTab toast={toast} />
      ) : adminSection === "sheets" ? (
        <AdminSheetSyncTab toast={toast} />
      ) : (
        <>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("adminSectionUsers")}</h1>
          <p className="page-sub">
            {isOwner(profile) ? t("manageSubOwner") : t("manageSubAdmin")}
          </p>
        </div>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field style={{ minWidth: 120, marginBottom: 0 }}>
            <Select value={role} onChange={e => setRole(e.target.value)}>
              {roles.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" size="sm" onClick={assignUser} disabled={saving}>
            {saving ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("addUser")}
          </Button>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : (
        <>
          {waitingInvites.length > 0 && (
            <>
              <div className="grouped-list-header">{t("waitingLogin")} ({waitingInvites.length})</div>
              <div style={{ marginBottom: 24 }}>
                {waitingInvites.map(i => (
                  <Card
                    key={i.email}
                    style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}
                  >
                    <Avatar name={i.email} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: "var(--ink)" }}>
                        <span dir="ltr">{i.email}</span>
                        <Badge variant={roleBadgeVariant(i.role)}>{roleLabel(i.role)}</Badge>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("notLoggedInYet")}</div>
                    </div>
                    {canRevokeUser(profile, { email: i.email, role: i.role }) && (
                      <Button variant="danger" size="sm" onClick={() => revoke({ email: i.email, role: i.role })}>{t("revoke")}</Button>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}

          <div className="grouped-list-header">{t("activeUsers")} ({approved.length})</div>
          {approved.length === 0 ? (
            <EmptyState title={t("noActiveUsers")} />
          ) : (
            <div>
              {approvedByRole.map(({ role: roleKey, users: roleUsers }) => {
                const isOpen = openRoles.has(roleKey);
                return (
                  <div className="role-section" key={roleKey}>
                    <button
                      type="button"
                      className={`role-section-header${isOpen ? " open" : ""}`}
                      onClick={() => toggleRoleSection(roleKey)}
                      aria-expanded={isOpen}
                    >
                      <span className="role-section-title">
                        <Badge variant={roleBadgeVariant(roleKey)}>{roleLabel(roleKey)}</Badge>
                        <span className="role-section-count">({roleUsers.length})</span>
                      </span>
                      <span className="role-section-chevron" aria-hidden="true">▼</span>
                    </button>
                    <div className={`role-section-body${isOpen ? " open" : ""}`}>
                      {roleUsers.map(u => renderUserRow(u, u.id))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
        </>
      )}
        </div>
      </div>
    </div>
    <AdminStudentProfileHost toast={toast} />
    </StudentProfileProvider>
  );
}

// ─────────────────────────────────────────────────────────────
//  PARENT TICKET (public — ?ticket=UUID or /t/TOKEN)
// ─────────────────────────────────────────────────────────────
function AccessPassTicket({ pass }) {
  const { t, fmtDateDay, locale } = useLang();
  const used = pass.status === "used" || !!pass.usedAt;
  const unpaid = pass.paymentStatus === "unpaid";

  return (
    <div style={{ padding: "24px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <span className={`badge ${used ? "badge-used" : unpaid ? "badge-used" : "badge-active"}`}>
          {used ? `✕ ${t("ticketUsedBadge")}` : unpaid ? t("ticketUnpaidBadge") : `✓ ${t("ticketValid")}`}
        </span>
      </div>
      <PassTicketCard
        qrToken={pass.qrToken}
        qrSize={220}
        label={used ? t("ticketUsedMsg") : t("showToGuard")}
      />
      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{pass.childName}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(pass.sessionDate)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(pass.startTime)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("sectionClass")}</span><span className="li-val">{pass.productName}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{pass.instructorName}</span></div>
      </div>
      {used && pass.usedAt && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--danger)", marginTop: 12 }}>
          {t("scannedOn")}: {new Date(pass.usedAt).toLocaleString(locale)}
        </div>
      )}
    </div>
  );
}

function ParentTicket({ id }) {
  const { t, fmtDateDay, locale } = useLang();
  const [lesson,  setLesson]  = useState(null);
  const [pass,    setPass]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("id", id).maybeSingle();
      if (!error && data) {
        setLesson(data);
        setLoading(false);
        return;
      }
      try {
        const passData = await fetchPublicPass(id);
        if (passData.ok) setPass(passData);
        else setErr(t("ticketNotFound"));
      } catch {
        setErr(t("ticketNotFound"));
      }
      setLoading(false);
    })();
  }, [id, t]);

  if (loading) return <div style={{padding:40,textAlign:"center",color:"var(--ink-soft)"}}>{t("loading")}</div>;
  if (pass) return <AccessPassTicket pass={pass} />;
  if (err || !lesson) return (
    <div className="result-card err" style={{margin:24}}>
      <div className="result-icon">❌</div>
      <div className="result-title">{t("ticketInvalid")}</div>
      <div className="result-detail">{err}</div>
    </div>
  );

  if (lesson.cancelled) return (
    <div className="result-card err" style={{ margin: 24 }}>
      <div className="result-icon">❌</div>
      <div className="result-title">{t("ticketCancelled")}</div>
      <div className="result-detail">{t("ticketCancelledMsg")}</div>
      <div className="lesson-info" style={{ marginTop: 16, textAlign: "right" }}>
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{lesson.child_name}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(lesson.lesson_date)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(lesson.start_time)}</span></div>
      </div>
    </div>
  );

  return (
    <div style={{padding:"24px 20px"}}>
      <div style={{textAlign:"center",marginBottom:8}}>
        <span className={`badge ${lesson.used ? "badge-used" : "badge-active"}`}>
          {lesson.used ? `✕ ${t("ticketUsedBadge")}` : `✓ ${t("ticketValid")}`}
        </span>
      </div>
      <TicketCard
        lesson={lesson}
        qrSize={220}
        label={lesson.used ? t("ticketUsedMsg") : t("showToGuard")}
      />
      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{lesson.child_name}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(lesson.lesson_date)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(lesson.start_time)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{lesson.instructor_name}</span></div>
      </div>
      {lesson.used && (
        <div style={{textAlign:"center",fontSize:12,color:"var(--danger)",marginTop:12}}>
          {t("scannedOn")}: {new Date(lesson.used_at).toLocaleString(locale)}
        </div>
      )}
      <Button
        variant="outline"
        fullWidth
        style={{ marginTop: 8 }}
        onClick={() => addToCalendar(lesson, "parent", { t, fmtDateDay })}
      >
        📅 {t("addToCalendar")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CALENDAR ADD (public — ?calendar=UUID)
// ─────────────────────────────────────────────────────────────
function CalendarAddPage({ id }) {
  const i18n = useLang();
  const { t, fmtDateDay } = i18n;
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const triggered = useRef(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("id", id).single();
      if (error || !data) setErr(t("ticketNotFound"));
      else setLesson(data);
      setLoading(false);
    })();
  }, [id, t]);

  useEffect(() => {
    if (!lesson || triggered.current) return;
    triggered.current = true;
    addToCalendar(lesson, "parent", i18n);
  }, [lesson, i18n]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>{t("loading")}</div>;
  if (err || !lesson) return (
    <div className="result-card err" style={{ margin: 24 }}>
      <div className="result-icon">❌</div>
      <div className="result-title">{t("ticketInvalid")}</div>
      <div className="result-detail">{err}</div>
    </div>
  );

  if (lesson.cancelled) return (
    <div className="result-card err" style={{ margin: 24 }}>
      <div className="result-icon">❌</div>
      <div className="result-title">{t("ticketCancelled")}</div>
      <div className="result-detail">{t("ticketCancelledMsg")}</div>
    </div>
  );

  return (
    <div style={{ padding: "24px 20px" }}>
      <div className="section-title">{t("calendarPageTitle")}</div>
      <div className="section-sub">{t("calendarPageSub")}</div>
      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{lesson.child_name}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(lesson.lesson_date)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(lesson.start_time)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("duration")}</span><span className="li-val">{t("calDurationValue")}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{lesson.instructor_name}</span></div>
      </div>
      <Button variant="primary" fullWidth style={{ marginTop: 8 }} onClick={() => addToCalendar(lesson, "parent", i18n)}>
        📅 {t("addToCalendar")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const { t, dir, roleLabel } = useLang();
  const [session,  setSession]  = useState(undefined); // undefined = loading
  const [profile,  setProfile]  = useState(null);
  const [tab,      setTab]      = useState("instructor");
  const [adminSection, setAdminSection] = useState("customers");
  const [personalSection, setPersonalSection] = useState("schedule");
  const [tabDirection, setTabDirection] = useState(0);
  const [attendanceFocus, setAttendanceFocus] = useState(null);
  const reducedMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const scheduleRef = useRef(null);
  const toast = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get("ticket");
  const calendarId = urlParams.get("calendar");
  const assessmentRegister = parseAssessmentRegisterPath();
  const summerRegister = parseSummerRegisterPath();
  const pathPassToken = parsePublicPathToken();

  const loadProfile = useCallback(async (user) => {
    const email = user.email.toLowerCase();
    const owner = email === ADMIN_EMAIL;

    const { data: assignment } = await supabase
      .from("role_assignments")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

    if (!data) {
      const role = owner ? "admin" : (assignment?.role || null);
      const status = owner || assignment ? "approved" : "pending";
      const { data: created, error } = await supabase.from("profiles").insert([{
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email,
        avatar_url: user.user_metadata?.avatar_url || null,
        status,
        role,
      }]).select().single();
      if (!error) setProfile(created);
      return;
    }

    if (owner && (data.role !== "admin" || data.status !== "approved")) {
      const { data: updated } = await supabase.from("profiles")
        .update({ status: "approved", role: "admin" })
        .eq("id", user.id).select().single();
      setProfile(updated || data);
      return;
    }

    if (!owner && assignment && (data.status !== "approved" || data.role !== assignment.role)) {
      const { data: updated } = await supabase.from("profiles")
        .update({ status: "approved", role: assignment.role })
        .eq("id", user.id).select().single();
      setProfile(updated || data);
      return;
    }

    setProfile(data);
  }, []);

  // Restore session from localStorage on every visit (INITIAL_SESSION fires after init)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        setSession(session ?? null);
        if (session?.user) loadProfile(session.user);
        return;
      }
      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        return;
      }
      if (event === "SIGNED_IN") {
        setSession(session);
        if (session?.user) loadProfile(session.user);
        if (window.location.search.includes("code=")) {
          window.history.replaceState({}, "", window.location.pathname + window.location.hash);
        }
        return;
      }
      if (event === "TOKEN_REFRESHED" && session) {
        setSession(session);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile || profile.status !== "approved") return;
    if (getPlatformGate(profile, isDesktop)) return;
    setTab((current) => sanitizeActiveTab(current, profile, isDesktop));
    setAdminSection((current) => sanitizeAdminSection(current, profile, isDesktop));
  }, [profile, isDesktop]);

  const logout = async () => { await supabase.auth.signOut(); };

  // ── Summer course registration (invite-only, no auth) ──────
  if (summerRegister) return (
    <>
      <div className="app" dir={dir}>
        <div className="header">
          <div className="header-top">
            <div className="header-logo"><BrandLogo height={32} /> {t("summerRegisterTitle")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher compact />
            </div>
          </div>
          <div className="header-sub">{t("neveOz")}</div>
        </div>
        <div className="content" style={{ paddingBottom: "var(--space-5)" }}>
          <SummerRegisterPage toast={toast} />
        </div>
      </div>
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  // ── Assessment registration (public landing page, no auth) ─
  if (assessmentRegister) return (
    <>
      <AssessmentRegisterPage toast={toast} />
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  // ── Calendar add (public, no auth needed) ─────────────────
  if (calendarId) return (
    <>
      <div className="app" dir={dir}>
        <div className="header">
          <div className="header-top">
            <div className="header-logo"><BrandLogo height={32} /> {t("calendarPageTitle")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher compact />
            </div>
          </div>
          <div className="header-sub">{t("neveOz")}</div>
        </div>
        <div className="content" style={{ paddingBottom: "var(--space-5)" }}>
          <CalendarAddPage id={calendarId} />
        </div>
      </div>
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  // ── Ticket view (public, no auth needed) ──────────────────
  const publicTicketId = pathPassToken || ticketId;
  if (publicTicketId) return (
    <>
      <div className="app" dir={dir}>
        <div className="header">
          <div className="header-top">
            <div className="header-logo"><BrandLogo height={32} /> {t("parentTicket")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher compact />
              <span className={`badge ${headerRoleBadgeClass(null, { parent: true })}`}>{t("roleParent")}</span>
            </div>
          </div>
          <div className="header-sub">{t("neveOz")}</div>
        </div>
        <div className="content" style={{ paddingBottom: "var(--space-5)" }}>
          <ParentTicket id={publicTicketId} />
        </div>
      </div>
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  // ── Loading ───────────────────────────────────────────────
  if (session === undefined) return (
    <>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--ink-soft)"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40}}>🏊</div><div style={{marginTop:12}}>{t("loading")}</div></div>
      </div>
    </>
  );

  // ── Not logged in ─────────────────────────────────────────
  if (!session) return (
    <>
      <LoginPage toast={toast} />
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  // ── Logged in but profile not loaded yet ──────────────────
  if (!profile) return (
    <>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--ink-soft)"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40}}>🏊</div><div style={{marginTop:12}}>{t("loadingProfile")}</div></div>
      </div>
    </>
  );

  // ── Pending approval ──────────────────────────────────────
  if (profile.status === "pending") return (
    <>
      <PendingPage user={profile} onLogout={logout} />
      <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
    </>
  );

  const platformGate = getPlatformGate(profile, isDesktop);
  if (platformGate) {
    return (
      <>
        <PlatformGatePage gate={platformGate} onLogout={logout} />
        <AnimatedToast msg={toast.msg} visible={toast.visible} standalone />
      </>
    );
  }

  const allTabs = getVisibleTabs(profile, isDesktop, t);

  const tabOrder = allTabs.map(ti => ti.id);

  const goToTab = (nextId) => {
    const from = tabOrder.indexOf(tab);
    const to = tabOrder.indexOf(nextId);
    if (from !== -1 && to !== -1 && from !== to) {
      setTabDirection(to > from ? 1 : -1);
    }
    setTab(nextId);
  };

  const handleMarkAttendanceFromSchedule = (focus) => {
    setAttendanceFocus(focus);
    goToTab("attendance");
  };

  const slideOffset = (motionDir) => {
    if (reducedMotion) return 0;
    const sign = dir === "rtl" ? -1 : 1;
    return sign * motionDir * 20;
  };

  const tabTransition = reducedMotion
    ? { duration: 0.01 }
    : { duration: 0.3, ease: [0.32, 0.72, 0, 1] };

  const renderActiveTab = () => {
    switch (tab) {
      case "instructor": return <InstructorTab profile={profile} toast={toast} />;
      case "attendance": return (
        <InstructorAttendanceTab
          toast={toast}
          initialFocus={attendanceFocus}
          onFocusHandled={() => setAttendanceFocus(null)}
        />
      );
      case "guard":      return <GuardTab toast={toast} />;
      case "schedule":   return (
        <ScheduleTab
          ref={scheduleRef}
          profile={profile}
          toast={toast}
          onMarkAttendance={handleMarkAttendanceFromSchedule}
        />
      );
      case "office":     return <OfficeTab toast={toast} />;
      case "admin":      return (
        <AdminTab
          profile={profile}
          toast={toast}
          adminSection={adminSection}
          onAdminSectionChange={setAdminSection}
        />
      );
      case "personal":   return (
        <InstructorPersonalTab
          profile={profile}
          toast={toast}
          personalSection={personalSection}
          onPersonalSectionChange={setPersonalSection}
          onMarkAttendance={handleMarkAttendanceFromSchedule}
        />
      );
      default:           return null;
    }
  };

  const useNarrowContent = isDesktop && !PRIORITY_TABS.has(tab);

  const activeTabMeta = allTabs.find(ti => ti.id === tab);
  const adminSectionTitles = {
    customers: t("tabCustomers"),
    users: t("adminSectionUsers"),
    enrollments: t("tabEnrollments"),
    products: t("tabProducts"),
    pricelist: t("tabPriceList"),
    seasons: t("tabSeasons"),
    assessment: t("tabAssessment"),
    marketing: t("tabMarketing"),
    attendance: t("tabAttendance"),
    alerts: t("tabAlerts"),
    operations: t("tabOperations"),
    utilization: t("tabUtilization"),
    waitlist: t("tabWaitlist"),
    dashboard: t("tabDashboard"),
    health: t("tabHealth"),
    students: t("tabStudents"),
    finance: t("tabFinance"),
    instructors: t("tabInstructorsAnalytics"),
    payroll: t("tabPayroll"),
    sheets: t("tabSheetSync"),
  };
  const topBarTitle = tab === "admin"
    ? (adminSectionTitles[adminSection] || activeTabMeta?.label || t("tabAdmin"))
    : tab === "personal"
      ? personalSectionLabel(personalSection, t)
      : (activeTabMeta?.label || t("tabSchedule"));
  const topBarSubtitle = tab === "schedule"
    ? t("scheduleSub")
    : tab === "admin" && adminSection === "customers"
      ? t("customersSub")
      : tab === "admin" && adminSection === "users"
      ? (isOwner(profile) ? t("manageSubOwner") : t("manageSubAdmin"))
      : null;

  const scheduleTopBarActions = tab === "schedule" && isDesktop ? (
    <>
      <Button variant="secondary" size="sm" onClick={() => scheduleRef.current?.goToday()}>
        {t("today")}
      </Button>
      {canEditSchedule(profile) && (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={15} aria-hidden />}
          onClick={() => scheduleRef.current?.openCreateLesson()}
        >
          {t("newLesson")}
        </Button>
      )}
    </>
  ) : null;

  const topBarTrailing = isDesktop ? (
    <>
      <LanguageSwitcher compact />
      <Button variant="ghost" size="sm" onClick={logout}>{t("logout")}</Button>
    </>
  ) : null;

  const tabPanel = (
    <AnimatePresence mode="popLayout" custom={tabDirection} initial={false}>
      <motion.div
        key={tab}
        custom={tabDirection}
        className={`tab-panel${useNarrowContent ? " content-narrow" : ""}`}
        variants={{
          enter: (motionDir) => ({
            opacity: 0,
            x: slideOffset(motionDir),
          }),
          center: { opacity: 1, x: 0 },
          exit: (motionDir) => ({
            opacity: 0,
            x: slideOffset(-motionDir),
          }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={tabTransition}
      >
        {renderActiveTab()}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      <div className={`app${isDesktop ? " app--desktop" : ""}`} dir={dir}>
        {isDesktop ? (
          <AppWorkspaceShell
            tabs={allTabs}
            activeTab={tab}
            onTabChange={goToTab}
            profile={profile}
            brandTitle={t("neveOz")}
            brandSubtitle={VENUE_NAME}
            roleLabel={roleLabel(profile.role, isOwner(profile))}
            topBarTitle={topBarTitle}
            topBarSubtitle={topBarSubtitle}
            topBarActions={scheduleTopBarActions}
            topBarTrailing={topBarTrailing}
          >
            {tabPanel}
          </AppWorkspaceShell>
        ) : (
          <>
            <div className="app-main">
              <div className="header topbar app-header">
                <div className="header-top">
                  <div className="header-logo"><BrandLogo height={32} /> {t("neveOz")}</div>
                  <div className="topbar-actions">
                    <LanguageSwitcher compact />
                    <span className={`badge ${headerRoleBadgeClass(profile.role, { owner: isOwner(profile) })}`}>{roleLabel(profile.role, isOwner(profile))}</span>
                  </div>
                </div>
                <div className="header-user">
                  {profile.avatar_url
                    ? <img className="avatar" src={profile.avatar_url} alt="" />
                    : <div className="avatar-placeholder">{initials(profile.full_name)}</div>
                  }
                  <EditableDisplayName profile={profile} onUpdate={setProfile} toast={toast} />
                  <button className="btn-logout" onClick={logout}>{t("logout")}</button>
                </div>
              </div>

              <div className="content tab-stage">
                {tabPanel}
              </div>
            </div>

            <nav className="nav" role="tablist">
              {allTabs.map(tabItem => (
                <button
                  key={tabItem.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === tabItem.id}
                  className={`nav-btn ${tab === tabItem.id ? "active" : ""}`}
                  onClick={() => goToTab(tabItem.id)}
                >
                  <span className="nav-icon">
                    <TabIcon id={tabItem.id} active={tab === tabItem.id} />
                  </span>
                  {tabItem.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
      <AnimatedToast msg={toast.msg} visible={toast.visible} />
    </>
  );
}
