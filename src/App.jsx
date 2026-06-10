import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { useLang, LanguageSwitcher, fmtDate as fmt_date } from "./i18n.jsx";

// ─────────────────────────────────────────────────────────────
//  CONFIG — החלף עם הערכים מ-Supabase
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const isOwner       = (p) => !!p && p.email?.toLowerCase() === ADMIN_EMAIL;
const canManage     = (p) => isOwner(p) || p?.role === "admin";
const canCreateLesson = (p) => isOwner(p) || p?.role === "admin" || p?.role === "instructor";
const canScan       = (p) => isOwner(p) || p?.role === "admin" || p?.role === "instructor" || p?.role === "guard";
const canViewHistory = (p) => canCreateLesson(p);

const assignableRoles = (p) => {
  if (isOwner(p)) return ["admin", "instructor", "guard"];
  if (p?.role === "admin") return ["instructor", "guard"];
  return [];
};

const canRevokeUser = (actor, target) => {
  if (!target || isOwner(target)) return false;
  if (target.role === "admin" && !isOwner(actor)) return false;
  return canManage(actor);
};

// ─────────────────────────────────────────────────────────────
//  DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --pool:        #0077B6;
    --pool-deep:   #023E8A;
    --pool-light:  #90E0EF;
    --pool-pale:   #CAF0F8;
    --surface:     #F0F8FF;
    --white:       #FFFFFF;
    --ink:         #012A4A;
    --ink-mid:     #2C6E8A;
    --ink-soft:    #6BA3BE;
    --success:     #00B894;
    --success-bg:  #EAFAF6;
    --danger:      #D63031;
    --danger-bg:   #FFF0F0;
    --warn:        #FDCB6E;
    --warn-bg:     #FFFBF0;
    --border:      #C8E6F0;
    --radius:      16px;
    --radius-sm:   10px;
    --shadow:      0 4px 24px rgba(0,119,182,.10);
    --shadow-lg:   0 8px 40px rgba(0,119,182,.16);
  }
  html, body { height: 100%; background: var(--surface); direction: rtl; }
  body { font-family: 'IBM Plex Sans Hebrew', sans-serif; color: var(--ink); min-height: 100vh; }

  /* APP SHELL */
  .app { max-width: 440px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: var(--white); box-shadow: var(--shadow-lg); }

  /* HEADER */
  .header { background: linear-gradient(135deg, var(--pool-deep) 0%, var(--pool) 100%); padding: 20px 24px 28px; color: var(--white); position: relative; overflow: hidden; }
  .header::after { content:''; position:absolute; bottom:-20px; left:-10%; right:-10%; height:40px; background:var(--white); border-radius:50% 50% 0 0/100% 100% 0 0; }
  .header-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
  .header-logo { font-size:20px; font-weight:700; display:flex; align-items:center; gap:8px; }
  .brand-logo { width:auto; object-fit:contain; display:block; }
  .ticket-title { font-size:14px; font-weight:700; color:var(--ink-mid); margin:12px 0 14px; text-align:center; }
  .header-sub { font-size:12px; opacity:.75; font-weight:300; }
  .role-badge { font-family:'IBM Plex Mono',monospace; font-size:11px; background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.3); padding:4px 10px; border-radius:20px; font-weight:500; }
  .header-user { display:flex; align-items:center; gap:8px; margin-top:10px; }
  .avatar { width:30px; height:30px; border-radius:50%; border:2px solid rgba(255,255,255,.4); object-fit:cover; }
  .avatar-placeholder { width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,.25); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; }
  .user-name { font-size:13px; font-weight:500; flex:1; }
  .user-name-btn { background:none; border:none; color:#fff; font-family:inherit; font-size:13px; font-weight:500; flex:1; text-align:right; cursor:pointer; padding:0; display:flex; align-items:center; gap:6px; }
  .user-name-btn:hover { opacity:.85; }
  .name-edit { flex:1; display:flex; gap:6px; align-items:center; min-width:0; }
  .name-edit-input { flex:1; min-width:0; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.4); background:rgba(255,255,255,.15); color:#fff; font-family:inherit; font-size:13px; outline:none; }
  .name-edit-input::placeholder { color:rgba(255,255,255,.55); }
  .name-edit-btn { background:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.3); color:#fff; padding:4px 10px; border-radius:8px; font-size:11px; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; }
  .btn-logout { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25); color:#fff; padding:5px 12px; border-radius:20px; font-size:12px; cursor:pointer; font-family:inherit; transition:background .15s; flex-shrink:0; }
  .btn-logout:hover { background:rgba(255,255,255,.25); }

  /* NAV */
  .nav { display:flex; background:var(--white); border-bottom:1px solid var(--border); padding:0 8px; gap:4px; position:sticky; top:0; z-index:10; }
  .nav-btn { flex:1; padding:13px 6px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-family:inherit; font-size:12px; font-weight:500; color:var(--ink-soft); transition:all .18s; display:flex; flex-direction:column; align-items:center; gap:3px; }
  .nav-btn .nav-icon { font-size:17px; }
  .nav-btn.active { color:var(--pool); border-bottom-color:var(--pool); }
  .nav-btn:hover { color:var(--pool); background:var(--surface); }

  /* CONTENT */
  .content { flex:1; padding:28px 20px 48px; }

  /* SECTION */
  .section-title { font-size:20px; font-weight:700; color:var(--ink); margin-bottom:4px; }
  .section-sub { font-size:13px; color:var(--ink-soft); margin-bottom:24px; }

  /* CARD */
  .card { background:var(--white); border:1px solid var(--border); border-radius:var(--radius); padding:20px; box-shadow:var(--shadow); margin-bottom:16px; }

  /* FORM */
  .field { margin-bottom:16px; }
  .label { display:block; font-size:11px; font-weight:700; color:var(--ink-mid); margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
  .input { width:100%; padding:12px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:inherit; font-size:15px; color:var(--ink); background:var(--surface); transition:border-color .15s; outline:none; direction:rtl; }
  .input:focus { border-color:var(--pool); background:var(--white); }
  .input-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  select.input { cursor:pointer; }

  /* TIME SCROLL PICKER */
  .time-picker { display:flex; align-items:center; justify-content:center; gap:2px; background:var(--surface); border:1.5px solid var(--border); border-radius:var(--radius-sm); height:168px; overflow:hidden; position:relative; user-select:none; touch-action:pan-y; direction:ltr; }
  .time-picker::before { content:''; position:absolute; left:10px; right:10px; top:50%; transform:translateY(-50%); height:44px; background:rgba(0,119,182,.07); border-radius:8px; border:1.5px solid var(--pool-light); pointer-events:none; z-index:1; }
  .time-col { flex:1; height:100%; overflow-y:scroll; scroll-snap-type:y mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none; overscroll-behavior:contain; }
  .time-col::-webkit-scrollbar { display:none; }
  .time-col-spacer { height:62px; flex-shrink:0; }
  .time-item { height:44px; display:flex; align-items:center; justify-content:center; scroll-snap-align:center; font-size:22px; font-weight:600; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; transition:color .15s, font-size .15s; }
  .time-item.active { color:var(--pool-deep); font-size:24px; }
  .time-sep { font-size:24px; font-weight:700; color:var(--ink-mid); z-index:2; line-height:1; padding-bottom:2px; }

  /* BUTTONS */
  .btn { width:100%; padding:14px; border:none; border-radius:var(--radius-sm); font-family:inherit; font-size:15px; font-weight:600; cursor:pointer; transition:all .18s; display:flex; align-items:center; justify-content:center; gap:8px; }
  .btn-primary { background:linear-gradient(135deg,var(--pool) 0%,var(--pool-deep) 100%); color:#fff; box-shadow:0 4px 16px rgba(0,119,182,.28); }
  .btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,119,182,.36); }
  .btn-primary:active { transform:translateY(0); }
  .btn-google { background:#fff; color:#3c4043; border:1.5px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .btn-google:hover { background:var(--surface); }
  .btn-success { background:var(--success); color:#fff; }
  .btn-danger { background:var(--danger); color:#fff; }
  .btn-whatsapp { background:#25D366; color:#fff; }
  .btn-outline { background:var(--white); color:var(--pool); border:1.5px solid var(--pool); }
  .btn-sm { padding:8px 16px; font-size:13px; width:auto; border-radius:8px; }
  .btn:disabled { opacity:.45; cursor:not-allowed; transform:none !important; box-shadow:none !important; }
  .mt-8 { margin-top:8px; }
  .mt-16 { margin-top:16px; }

  /* LOGIN PAGE */
  .login-page { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 24px; background:var(--surface); }
  .login-logo { margin-bottom:16px; display:flex; justify-content:center; }
  .login-logo .brand-logo { height:72px; }
  .login-title { font-size:26px; font-weight:700; color:var(--ink); margin-bottom:6px; text-align:center; }
  .login-sub { font-size:14px; color:var(--ink-soft); margin-bottom:36px; text-align:center; line-height:1.6; }
  .login-card { background:var(--white); border-radius:var(--radius); padding:28px 24px; box-shadow:var(--shadow-lg); width:100%; max-width:360px; }

  /* PENDING PAGE */
  .pending-page { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 24px; text-align:center; }
  .pending-icon { font-size:64px; margin-bottom:16px; }
  .pending-title { font-size:22px; font-weight:700; color:var(--ink); margin-bottom:8px; }
  .pending-sub { font-size:14px; color:var(--ink-soft); line-height:1.7; max-width:300px; }

  /* QR */
  .qr-wrap { display:flex; flex-direction:column; align-items:center; padding:24px 20px 20px; background:var(--surface); border-radius:var(--radius); border:2px dashed var(--pool-light); margin:20px 0; }
  .qr-wrap canvas { border-radius:8px; }
  .qr-label { margin-top:14px; font-size:13px; color:var(--ink-mid); text-align:center; font-weight:500; }

  /* LESSON INFO */
  .lesson-info { background:var(--pool-pale); border-radius:var(--radius-sm); padding:16px; margin:12px 0; }
  .lesson-info-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:14px; }
  .lesson-info-row:not(:last-child) { border-bottom:1px solid var(--pool-light); }
  .li-key { color:var(--ink-mid); font-weight:500; }
  .li-val { font-weight:700; color:var(--ink); }

  /* SCANNER */
  .scanner-wrap { position:relative; border-radius:var(--radius); overflow:hidden; background:#000; aspect-ratio:1; margin:16px 0; }
  .scanner-wrap video, .scanner-wrap canvas { position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; }
  .scan-overlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:62%; aspect-ratio:1; border:2.5px solid var(--pool-light); border-radius:12px; box-shadow:0 0 0 999px rgba(0,0,0,.4); pointer-events:none; animation:scanPulse 2s ease-in-out infinite; }
  .scan-line { position:absolute; left:8%; right:8%; height:2px; background:var(--pool-light); animation:scanLine 2s linear infinite; }
  @keyframes scanLine { 0%{top:10%;opacity:1} 90%{top:88%;opacity:1} 100%{top:88%;opacity:0} }
  @keyframes scanPulse { 0%,100%{border-color:var(--pool-light)} 50%{border-color:var(--pool)} }
  .scan-hint { text-align:center; font-size:13px; color:var(--ink-soft); margin-top:8px; }

  /* RESULT */
  .result-card { border-radius:var(--radius); padding:24px 20px; text-align:center; margin:16px 0; animation:popIn .25s ease; }
  .result-card.ok { background:var(--success-bg); border:2px solid var(--success); }
  .result-card.err { background:var(--danger-bg); border:2px solid var(--danger); }
  .result-icon { font-size:52px; margin-bottom:10px; }
  .result-title { font-size:22px; font-weight:700; margin-bottom:6px; }
  .result-card.ok .result-title { color:var(--success); }
  .result-card.err .result-title { color:var(--danger); }
  .result-detail { font-size:14px; color:var(--ink-mid); line-height:1.6; white-space:pre-line; margin-top:8px; }
  @keyframes popIn { from{transform:scale(.92);opacity:0} to{transform:scale(1);opacity:1} }

  /* LOG */
  .log-item { display:flex; align-items:flex-start; gap:14px; padding:14px 0; border-bottom:1px solid var(--border); }
  .log-item:last-child { border-bottom:none; }
  .log-dot { width:10px; height:10px; border-radius:50%; margin-top:5px; flex-shrink:0; }
  .log-name { font-weight:600; font-size:15px; }
  .log-meta { font-size:12px; color:var(--ink-soft); margin-top:2px; font-family:'IBM Plex Mono',monospace; }

  /* BADGE */
  .badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; }
  .badge-used    { background:var(--danger-bg);  color:var(--danger);  }
  .badge-active  { background:var(--success-bg); color:var(--success); }
  .badge-pending { background:var(--warn-bg);    color:#b7791f; }
  .badge-admin   { background:#EDE9FE;            color:#5B21B6; }

  /* ADMIN USER ROW */
  .user-row { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid var(--border); }
  .user-row:last-child { border-bottom:none; }
  .user-avatar { width:38px; height:38px; border-radius:50%; background:var(--pool-pale); display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; color:var(--pool); flex-shrink:0; overflow:hidden; }
  .user-avatar img { width:100%; height:100%; object-fit:cover; }
  .user-info { flex:1; min-width:0; }
  .user-display { font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .user-email { font-size:12px; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .user-actions { display:flex; gap:6px; flex-shrink:0; }

  /* MISC */
  .divider { height:1px; background:var(--border); margin:20px 0; }
  .empty { text-align:center; padding:48px 20px; color:var(--ink-soft); }
  .empty-icon { font-size:48px; margin-bottom:12px; }
  .empty-text { font-size:15px; font-weight:500; }
  .empty-sub { font-size:13px; margin-top:6px; }
  .gap-8 { display:flex; flex-direction:column; gap:8px; }
  .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(80px); background:var(--ink); color:#fff; padding:12px 22px; border-radius:40px; font-size:14px; font-weight:500; box-shadow:var(--shadow-lg); transition:transform .3s ease; z-index:100; white-space:nowrap; }
  .toast.show { transform:translateX(-50%) translateY(0); }
  .spinner { width:20px; height:20px; border:2.5px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
  .info-box { background:var(--pool-pale); border:1px solid var(--pool-light); border-radius:var(--radius-sm); padding:14px 16px; font-size:13px; color:var(--ink-mid); line-height:1.6; margin-bottom:20px; }
  .lang-switcher { display:flex; gap:4px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:20px; padding:3px; }
  .lang-switcher-compact .lang-btn { padding:3px 8px; font-size:10px; }
  .lang-btn { background:transparent; border:none; color:rgba(255,255,255,.75); font-family:inherit; font-size:11px; font-weight:600; padding:4px 10px; border-radius:16px; cursor:pointer; transition:all .15s; }
  .lang-btn.active { background:rgba(255,255,255,.92); color:var(--pool-deep); }
  .lang-switcher-login { background:var(--surface); border-color:var(--border); margin-bottom:16px; }
  .lang-switcher-login .lang-btn { color:var(--ink-soft); }
  .lang-switcher-login .lang-btn.active { background:var(--pool); color:#fff; }
`;

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
const fmt_time = (t) => (t ? t.slice(0,5) : "");

const PICKER_HOURS   = Array.from({ length: 19 }, (_, i) => i + 5);   // 05–23
const PICKER_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);   // 00,05,…,55
const PICKER_ITEM_H  = 44;
const MIN_START_MINS = 5 * 60;    // 05:00
const MAX_START_MINS = 23 * 60;   // 23:00

function minutesForHour(hour) {
  return hour === 23 ? [0] : PICKER_MINUTES;
}

function snapMinute(m, options = PICKER_MINUTES) {
  return options.reduce((best, n) => Math.abs(n - m) < Math.abs(best - m) ? n : best, options[0]);
}

function parsePickerTime(value) {
  if (!value) return [9, 0];
  const [hh, mm] = value.split(":").map(Number);
  const hour = PICKER_HOURS.includes(hh) ? hh : 9;
  const mins = minutesForHour(hour);
  const minute = hour === 23 ? 0 : snapMinute(mm, mins);
  return [hour, minute];
}

function isValidStartTime(time) {
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m;
  return total >= MIN_START_MINS && total <= MAX_START_MINS;
}

function TimeScrollPicker({ value, onChange }) {
  const hourRef = useRef(null);
  const minRef  = useRef(null);
  const [hour, minute] = parsePickerTime(value);
  const minuteOptions = minutesForHour(hour);

  const scrollTo = (ref, index) => {
    if (ref.current) ref.current.scrollTop = index * PICKER_ITEM_H;
  };

  useEffect(() => {
    const [h, m] = parsePickerTime(value);
    scrollTo(hourRef, PICKER_HOURS.indexOf(h));
    scrollTo(minRef, minutesForHour(h).indexOf(m));
  }, []);

  useEffect(() => {
    if (hour === 23) scrollTo(minRef, 0);
  }, [hour]);

  const emit = (h, m) => onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

  const onHourScroll = () => {
    const idx = Math.round(hourRef.current.scrollTop / PICKER_ITEM_H);
    const h = PICKER_HOURS[Math.max(0, Math.min(PICKER_HOURS.length - 1, idx))];
    const m = h === 23 ? 0 : minute;
    if (h !== hour || m !== minute) emit(h, m);
  };

  const onMinScroll = () => {
    if (hour === 23) return;
    const idx = Math.round(minRef.current.scrollTop / PICKER_ITEM_H);
    const m = minuteOptions[Math.max(0, Math.min(minuteOptions.length - 1, idx))];
    if (m !== minute) emit(hour, m);
  };

  return (
    <div className="time-picker">
      <div className="time-col" ref={hourRef} onScroll={onHourScroll}>
        <div className="time-col-spacer" />
        {PICKER_HOURS.map(h => (
          <div key={h} className={`time-item ${h === hour ? "active" : ""}`}>{String(h).padStart(2, "0")}</div>
        ))}
        <div className="time-col-spacer" />
      </div>
      <span className="time-sep">:</span>
      <div className="time-col" ref={minRef} onScroll={onMinScroll}>
        <div className="time-col-spacer" />
        {minuteOptions.map(m => (
          <div key={m} className={`time-item ${m === minute ? "active" : ""}`}>{String(m).padStart(2, "0")}</div>
        ))}
        <div className="time-col-spacer" />
      </div>
    </div>
  );
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
const LOGO_SRC = "/logo.png";
let logoCache = null;
let logoProcessedCache = null;

function loadLogoImage() {
  if (logoCache) return Promise.resolve(logoCache);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { logoCache = img; resolve(img); };
    img.onerror = reject;
    img.src = LOGO_SRC;
  });
}

function processLogoRemoveBlack(img) {
  if (logoProcessedCache) return logoProcessedCache;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 45 && data[i + 1] < 45 && data[i + 2] < 45) data[i + 3] = 0;
  }
  ctx.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
  logoProcessedCache = canvas;
  return canvas;
}

async function loadProcessedLogo() {
  return processLogoRemoveBlack(await loadLogoImage());
}

function BrandLogo({ height = 44 }) {
  const { t } = useLang();
  const [src, setSrc] = useState(null);
  useEffect(() => { loadProcessedLogo().then(c => setSrc(c.toDataURL("image/png"))); }, []);
  return (
    <img className="brand-logo" src={src || LOGO_SRC} alt={t("logoAlt")} style={{ height }} />
  );
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
    <div className="qr-wrap">
      <BrandLogo height={52} />
      <div className="ticket-title">{t("ticketTitle")}</div>
      <QRCanvas value={lesson.id} size={qrSize} />
      <div className="qr-label">{label || t("ticketOneTime")}</div>
    </div>
  );
}

function ticketCaption(lesson, { t, fmtDateDay }) {
  return [
    t("waHello"),
    t("waBarcodeFor", { name: lesson.child_name }),
    "",
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
    "",
    t("waShowGuard"),
  ].join("\n");
}

async function generateTicketImage(lesson, { t, fmtDateDay, dir }) {
  const [logo] = await Promise.all([
    loadProcessedLogo(),
    document.fonts?.load?.('600 15px "IBM Plex Sans Hebrew"'),
    document.fonts?.load?.('700 16px "IBM Plex Sans Hebrew"'),
  ].filter(Boolean));

  const qrSize = 280;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, lesson.id, {
    width: qrSize, margin: 2, color: { dark: "#012A4A", light: "#FFFFFF" },
  });

  const W = 400, pad = 28, logoH = 56;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = pad + logoH + 36 + qrSize + 120 + pad;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const logoW = logo.width * (logoH / logo.height);
  ctx.drawImage(logo, (W - logoW) / 2, pad, logoW, logoH);

  let y = pad + logoH + 36;
  ctx.fillStyle = "#012A4A";
  ctx.font = '700 16px "IBM Plex Sans Hebrew", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(t("ticketTitle"), W / 2, y);
  y += 28;

  ctx.drawImage(qrCanvas, (W - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 28;

  ctx.font = '600 15px "IBM Plex Sans Hebrew", Arial, sans-serif';
  const rtl = dir === "rtl";
  ctx.textAlign = rtl ? "right" : "left";
  const textX = rtl ? W - pad : pad;
  for (const line of [
    `${t("child")}: ${lesson.child_name}`,
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
  ]) {
    ctx.fillText(line, textX, y);
    y += 24;
  }

  ctx.font = '500 12px "IBM Plex Sans Hebrew", Arial, sans-serif';
  ctx.fillStyle = "#6BA3BE";
  ctx.textAlign = "center";
  ctx.fillText(t("ticketOneTime"), W / 2, y + 8);

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("image"))), "image/png");
  });
}

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function shareTicketViaWhatsApp(lesson, phone, toast, i18n) {
  const blob = await generateTicketImage(lesson, i18n);
  const file = new File([blob], `ticket-${lesson.child_name}.png`, { type: "image/png" });
  const caption = ticketCaption(lesson, i18n);
  const digits = phone.replace(/\D/g, "").replace(/^0/, "972");

  // בטלפון — שיתוף ישיר עם תמונה מצורפת (בוחרים WhatsApp ואז את ההורה)
  if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }

  // במחשב — מוריד את התמונה ופותח WhatsApp עם ההודעה (צרף את התמונה ידנית)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `כרטיס-${lesson.child_name}.png`;
  a.click();
  URL.revokeObjectURL(url);

  toast.show(i18n.t("imageDownloaded"));
  setTimeout(() => {
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(caption)}`, "_blank");
  }, 600);
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) { toast.show(t("loginError")); setLoading(false); }
  };

  return (
    <div className="login-page">
      <LanguageSwitcher className="lang-switcher-login" compact />
      <div className="login-logo"><BrandLogo height={72} /></div>
      <div className="login-title">{t("loginTitle")}</div>
      <div className="login-sub">{t("loginSub")}<br />{t("loginContinue")}</div>
      <div className="login-card">
        <button className="btn btn-google" onClick={signIn} disabled={loading}>
          {loading ? <><div className="spinner" style={{borderTopColor:"var(--pool)"}}/> {t("signingIn")}</> : <><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style={{width:18,height:18}}/> {t("signInGoogle")}</>}
        </button>
        <div style={{marginTop:20,fontSize:12,color:"var(--ink-soft)",textAlign:"center",lineHeight:1.6}}>
          {t("loginNote")}
        </div>
      </div>
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
      <button className="btn btn-outline mt-16" style={{width:"auto",marginTop:32}} onClick={onLogout}>
        {t("logout")}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  INSTRUCTOR TAB
// ─────────────────────────────────────────────────────────────
function InstructorTab({ profile, toast }) {
  const i18n = useLang();
  const { t, fmtDateDay, dir } = i18n;
  const blank = { child_name:"", lesson_date:"", start_time:"09:00", parent_phone:"" };
  const [form, setForm]       = useState(blank);
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const create = async () => {
    const { child_name, lesson_date, start_time, parent_phone } = form;
    if (!child_name || !lesson_date || !start_time || !parent_phone) return toast.show(t("fillAllFields"));
    if (!isValidStartTime(start_time)) return toast.show(t("invalidTime"));
    setLoading(true);
    const { data, error } = await supabase.from("lessons")
      .insert([{ child_name, lesson_date, start_time, end_time: start_time, instructor_name: profile.full_name }])
      .select().single();
    if (error) { toast.show(`${t("createError")}: ${error.message}`); setLoading(false); return; }
    setCreated({ ...data, parent_phone });
    setForm(blank);
    setLoading(false);
  };

  const sendWhatsApp = async () => {
    setSharing(true);
    try {
      await shareTicketViaWhatsApp(created, created.parent_phone, toast, i18n);
    } catch {
      toast.show(t("shareError"));
    }
    setSharing(false);
  };

  if (created) return (
    <div>
      <div className="section-title">{t("barcodeReady")}</div>
      <div className="section-sub">{t("barcodeReadySub")}</div>
      <TicketCard lesson={created} qrSize={200} />
      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{created.child_name}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(created.lesson_date)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(created.start_time)}</span></div>
        <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{created.instructor_name}</span></div>
      </div>
      <div className="gap-8">
        <button className="btn btn-whatsapp" onClick={sendWhatsApp} disabled={sharing}>
          {sharing ? <><div className="spinner"/> {t("preparingImage")}</> : t("sendWhatsApp")}
        </button>
        <button className="btn btn-outline" onClick={() => setCreated(null)}>+ {t("createAnother")}</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-title">{t("newLesson")}</div>
      <div className="section-sub">{t("newLessonSub")}</div>
      <div className="card">
        <div className="field"><label className="label">{t("childName")}</label>
          <input className="input" placeholder={t("childPlaceholder")} value={form.child_name} onChange={upd("child_name")} dir={dir} /></div>
        <div className="field"><label className="label">{t("lessonDate")}</label>
          <input className="input" type="date" value={form.lesson_date} onChange={upd("lesson_date")} />
          {form.lesson_date && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>{fmtDateDay(form.lesson_date)}</div>
          )}
        </div>
        <div className="field"><label className="label">{t("lessonStartTime")}</label>
          <TimeScrollPicker value={form.start_time} onChange={v => setForm(f => ({ ...f, start_time: v }))} />
          <div style={{fontSize:11,color:"var(--ink-soft)",marginTop:6}}>{t("timeHint")}</div>
        </div>
        <div className="field"><label className="label">{t("parentPhone")}</label>
          <input className="input" type="tel" placeholder="050-0000000" value={form.parent_phone} onChange={upd("parent_phone")} dir="ltr" /></div>
        <button className="btn btn-primary mt-8" onClick={create} disabled={loading}>
          {loading ? <><div className="spinner"/> {t("creating")}</> : t("createBarcode")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  GUARD TAB
// ─────────────────────────────────────────────────────────────
function GuardTab({ toast }) {
  const { t, fmtDateDay, locale } = useLang();
  const videoRef = useRef(); const canvasRef = useRef(); const animRef = useRef();
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [log,      setLog]      = useState([]);

  useEffect(() => { loadLog(); }, []);

  const loadLog = async () => {
    const { data } = await supabase.from("lessons").select("*")
      .eq("used", true).order("used_at", { ascending: false }).limit(15);
    if (data) setLog(data);
  };

  const startScan = async () => {
    setResult(null); setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      requestAnimationFrame(tick);
    } catch { toast.show(t("noCamera")); setScanning(false); }
  };

  const stopScan = () => {
    cancelAnimationFrame(animRef.current);
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
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

  const processQR = async (uuid) => {
    stopScan(); setLoading(true);
    try {
      const { data: lesson, error } = await supabase.from("lessons").select("*").eq("id", uuid).single();
      if (error || !lesson) { setResult({ ok:false, msg: t("barcodeNotFound") }); setLoading(false); return; }
      if (lesson.used) { setResult({ ok:false, lesson, msg:`${t("barcodeUsed")}\n${t("scannedOn")}: ${new Date(lesson.used_at).toLocaleString(locale)}` }); setLoading(false); return; }
      const { error: upErr } = await supabase.from("lessons").update({ used:true, used_at: new Date().toISOString() }).eq("id", uuid);
      if (upErr) throw upErr;
      setResult({ ok:true, lesson }); loadLog();
    } catch { setResult({ ok:false, msg: t("systemError") }); }
    setLoading(false);
  };

  return (
    <div>
      <div className="section-title">{t("poolEntry")}</div>
      <div className="section-sub">{t("scanSub")}</div>

      {loading && <div style={{textAlign:"center",padding:40,color:"var(--ink-mid)",fontWeight:600}}>⏳ {t("verifying")}</div>}

      {!scanning && !loading && !result && (
        <button className="btn btn-primary" onClick={startScan}>📷 {t("scanBarcode")}</button>
      )}

      {scanning && (
        <>
          <div className="scanner-wrap">
            <video ref={videoRef} playsInline muted style={{display:"block"}} />
            <canvas ref={canvasRef} style={{display:"none"}} />
            <div className="scan-overlay"><div className="scan-line"/></div>
          </div>
          <div className="scan-hint">{t("scanHint")}</div>
          <button className="btn btn-outline mt-8" onClick={stopScan}>{t("cancel")}</button>
        </>
      )}

      {result && !loading && (
        <>
          <div className={`result-card ${result.ok ? "ok" : "err"}`}>
            <div className="result-icon">{result.ok ? "✅" : "🚫"}</div>
            <div className="result-title">{result.ok ? t("entryApproved") : t("entryDenied")}</div>
            {result.ok && result.lesson && (
              <div className="lesson-info" style={{marginTop:12}}>
                <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{result.lesson.child_name}</span></div>
                <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(result.lesson.lesson_date)}</span></div>
                <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(result.lesson.start_time)}</span></div>
                <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{result.lesson.instructor_name}</span></div>
              </div>
            )}
            {!result.ok && <div className="result-detail">{result.msg}</div>}
          </div>
          <button className="btn btn-outline" onClick={() => setResult(null)}>{t("scanAnother")}</button>
        </>
      )}

      {log.length > 0 && (
        <>
          <div className="divider"/>
          <div style={{fontSize:12,fontWeight:700,color:"var(--ink-mid)",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>{t("recentEntries")}</div>
          <div className="card" style={{padding:"4px 16px"}}>
            {log.slice(0,8).map(l => (
              <div className="log-item" key={l.id}>
                <div className="log-dot" style={{background:"var(--success)"}}/>
                <div>
                  <div className="log-name">{l.child_name}</div>
                  <div className="log-meta">{fmtDateDay(l.lesson_date)} · {fmt_time(l.start_time)} · {l.instructor_name}</div>
                  <div className="log-meta">{t("scannedAt")}: {new Date(l.used_at).toLocaleTimeString(locale)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  LOG TAB
// ─────────────────────────────────────────────────────────────
function LogTab() {
  const { t, fmtDateDay, locale } = useLang();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("lessons").select("*").order("created_at",{ascending:false}).limit(200);
      if (data) setEntries(data);
      setLoading(false);
    })();
  }, []);

  const filtered = entries.filter(e =>
    !filter || e.child_name.includes(filter) || e.instructor_name?.includes(filter)
  );

  return (
    <div>
      <div className="section-title">{t("history")}</div>
      <div className="section-sub">{t("historySub")}</div>
      <input className="input" placeholder={t("searchPlaceholder")} value={filter}
        onChange={e => setFilter(e.target.value)} style={{marginBottom:16}} />
      {loading ? (
        <div style={{textAlign:"center",padding:32,color:"var(--ink-soft)"}}>{t("loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📋</div><div className="empty-text">{t("noResults")}</div></div>
      ) : (
        <div className="card" style={{padding:"4px 16px"}}>
          {filtered.map(l => (
            <div className="log-item" key={l.id}>
              <div className="log-dot" style={{background: l.used ? "var(--success)" : "var(--warn)"}}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div className="log-name">{l.child_name}</div>
                  <span className={`badge ${l.used ? "badge-used" : "badge-active"}`}>{l.used ? t("used") : t("waiting")}</span>
                </div>
                <div className="log-meta">{fmtDateDay(l.lesson_date)} · {fmt_time(l.start_time)}</div>
                <div className="log-meta">{t("instructor")}: {l.instructor_name}</div>
                {l.used && <div className="log-meta">{t("entry")}: {new Date(l.used_at).toLocaleString(locale)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ADMIN TAB
// ─────────────────────────────────────────────────────────────
function AdminTab({ profile, toast }) {
  const { t, roleLabel } = useLang();
  const [users,    setUsers]    = useState([]);
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [email,    setEmail]    = useState("");
  const [role,     setRole]     = useState("instructor");

  const roles = assignableRoles(profile);

  const load = async () => {
    setLoading(true);
    const [{ data: usersData }, { data: invitesData }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("role_assignments").select("*").order("created_at", { ascending: false }),
    ]);
    setUsers(usersData || []);
    setInvites(invitesData || []);
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

  const approved = users.filter(u => u.status === "approved" && u.role);
  const approvedEmails = new Set(approved.map(u => u.email?.toLowerCase()));
  const waitingInvites = invites.filter(i => !approvedEmails.has(i.email?.toLowerCase()));

  const roleBadgeClass = (r) =>
    r === "admin" ? "badge-admin" : r === "instructor" ? "badge-active" : "badge-pending";

  return (
    <div>
      <div className="section-title">{t("manageUsers")}</div>
      <div className="section-sub">
        {isOwner(profile) ? t("manageSubOwner") : t("manageSubAdmin")}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field">
          <label className="label">{t("userEmail")}</label>
          <input className="input" type="email" placeholder="name@example.com" value={email}
            onChange={e => setEmail(e.target.value)} dir="ltr" />
        </div>
        <div className="field">
          <label className="label">{t("roleProfile")}</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            {roles.map(r => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={assignUser} disabled={saving}>
          {saving ? <><div className="spinner" /> {t("saving")}</> : t("addUser")}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : (
        <>
          {waitingInvites.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#b7791f", marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>
                {t("waitingLogin")} ({waitingInvites.length})
              </div>
              <div className="card" style={{ padding: "4px 16px", marginBottom: 24 }}>
                {waitingInvites.map(i => (
                  <div className="user-row" key={i.email}>
                    <div className="user-avatar">{initials(i.email)}</div>
                    <div className="user-info">
                      <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {i.email}
                        <span className={`badge ${roleBadgeClass(i.role)}`}>{roleLabel(i.role)}</span>
                      </div>
                      <div className="user-email">{t("notLoggedInYet")}</div>
                    </div>
                    {canRevokeUser(profile, { email: i.email, role: i.role }) && (
                      <button className="btn btn-danger btn-sm" onClick={() => revoke({ email: i.email, role: i.role })}>{t("revoke")}</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-mid)", marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>
            {t("activeUsers")} ({approved.length})
          </div>
          {approved.length === 0 ? (
            <div className="empty"><div className="empty-icon">👥</div><div className="empty-text">{t("noActiveUsers")}</div></div>
          ) : (
            <div className="card" style={{ padding: "4px 16px" }}>
              {approved.map(u => (
                <div className="user-row" key={u.id}>
                  <div className="user-avatar">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" /> : initials(u.full_name)}
                  </div>
                  <div className="user-info">
                    <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {u.full_name || "—"}
                      <span className={`badge ${roleBadgeClass(u.role)}`}>
                        {roleLabel(u.role, isOwner(u))}
                      </span>
                    </div>
                    <div className="user-email">{u.email}</div>
                  </div>
                  {canRevokeUser(profile, u) && (
                    <button className="btn btn-danger btn-sm" onClick={() => revoke(u)}>{t("revoke")}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PARENT TICKET (public — ?ticket=UUID)
// ─────────────────────────────────────────────────────────────
function ParentTicket({ id }) {
  const { t, fmtDateDay, locale } = useLang();
  const [lesson,  setLesson]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("lessons").select("*").eq("id", id).single();
      if (error || !data) setErr(t("ticketNotFound"));
      else setLesson(data);
      setLoading(false);
    })();
  }, [id, t]);

  if (loading) return <div style={{padding:40,textAlign:"center",color:"var(--ink-soft)"}}>{t("loading")}</div>;
  if (err || !lesson) return (
    <div className="result-card err" style={{margin:24}}>
      <div className="result-icon">❌</div>
      <div className="result-title">{t("ticketInvalid")}</div>
      <div className="result-detail">{err}</div>
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
  const toast = useToast();

  // Check for ?ticket= param
  const ticketId = new URLSearchParams(window.location.search).get("ticket");

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadProfile(session.user);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (canCreateLesson(profile)) setTab("instructor");
    else if (canScan(profile)) setTab("guard");
  }, [profile?.id, profile?.role, profile?.email]);

  const loadProfile = async (user) => {
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
  };

  const logout = async () => { await supabase.auth.signOut(); };

  // ── Ticket view (public, no auth needed) ──────────────────
  if (ticketId) return (
    <>
      <style>{css}</style>
      <div className="app" dir={dir}>
        <div className="header">
          <div className="header-top">
            <div className="header-logo"><BrandLogo height={32} /> {t("parentTicket")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher compact />
              <span className="role-badge">{t("roleParent")}</span>
            </div>
          </div>
          <div className="header-sub">{t("neveOz")}</div>
        </div>
        <ParentTicket id={ticketId} />
      </div>
      <div className={`toast ${toast.visible ? "show" : ""}`}>{toast.msg}</div>
    </>
  );

  // ── Loading ───────────────────────────────────────────────
  if (session === undefined) return (
    <>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--ink-soft)"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40}}>🏊</div><div style={{marginTop:12}}>{t("loading")}</div></div>
      </div>
    </>
  );

  // ── Not logged in ─────────────────────────────────────────
  if (!session) return (
    <>
      <style>{css}</style>
      <LoginPage toast={toast} />
      <div className={`toast ${toast.visible ? "show" : ""}`}>{toast.msg}</div>
    </>
  );

  // ── Logged in but profile not loaded yet ──────────────────
  if (!profile) return (
    <>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"var(--ink-soft)"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40}}>🏊</div><div style={{marginTop:12}}>{t("loadingProfile")}</div></div>
      </div>
    </>
  );

  // ── Pending approval ──────────────────────────────────────
  if (profile.status === "pending") return (
    <>
      <style>{css}</style>
      <PendingPage user={profile} onLogout={logout} />
      <div className={`toast ${toast.visible ? "show" : ""}`}>{toast.msg}</div>
    </>
  );

  // ── Approved — build tabs based on role hierarchy ─────────
  const allTabs = [
    canCreateLesson(profile) && { id:"instructor", icon:"🏊", label: t("tabLesson") },
    canScan(profile)         && { id:"guard",      icon:"🔍", label: t("tabScan") },
    canViewHistory(profile)  && { id:"log",        icon:"📋", label: t("tabHistory") },
    canManage(profile)       && { id:"admin",      icon:"⚙️", label: t("tabAdmin") },
  ].filter(Boolean);

  return (
    <>
      <style>{css}</style>
      <div className="app" dir={dir}>
        <div className="header">
          <div className="header-top">
            <div className="header-logo"><BrandLogo height={32} /> {t("neveOz")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher compact />
              <span className="role-badge">{roleLabel(profile.role, isOwner(profile))}</span>
            </div>
          </div>
          <div className="header-sub">{t("headerSub")}</div>
          <div className="header-user">
            {profile.avatar_url
              ? <img className="avatar" src={profile.avatar_url} alt="" />
              : <div className="avatar-placeholder">{initials(profile.full_name)}</div>
            }
            <EditableDisplayName profile={profile} onUpdate={setProfile} toast={toast} />
            <button className="btn-logout" onClick={logout}>{t("logout")}</button>
          </div>
        </div>

        <nav className="nav">
          {allTabs.map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id?"active":""}`} onClick={() => setTab(t.id)}>
              <span className="nav-icon">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>

        <div className="content">
          {tab === "instructor" && <InstructorTab profile={profile} toast={toast} />}
          {tab === "guard"      && <GuardTab toast={toast} />}
          {tab === "log"        && <LogTab />}
          {tab === "admin"      && <AdminTab profile={profile} toast={toast} />}
        </div>
      </div>
      <div className={`toast ${toast.visible ? "show" : ""}`}>{toast.msg}</div>
    </>
  );
}
