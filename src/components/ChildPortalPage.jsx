import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { useLang, LanguageSwitcher } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { PARTICIPANT_GRADES, PARTICIPANT_GENDERS } from "../lib/participantFields.js";
import {
  verifyPortalPin,
  fetchPortalDashboard,
  updatePortalProfile,
  setPortalPhoto,
  loadPortalSession,
  savePortalSession,
  clearPortalSession,
  portalBlockedMessage,
  fileToBase64,
} from "../lib/childPortal.js";
import { Button, Card, Field, Input, Select, Spinner } from "./ui/ds/index.js";
import "../styles/assessment-landing.css";
import "../styles/child-portal.css";

const LOGO_SRC = "/stream-line-logo.jpeg";
const LOGO_FALLBACK = "/logo.png";

function PortalQRCanvas({ value, size = 200 }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 2,
        color: { dark: "#012A4A", light: "#FFFFFF" },
      });
    }
  }, [value, size]);
  return <canvas ref={ref} />;
}

function genderOptions(t) {
  return PARTICIPANT_GENDERS.map((g) => ({
    value: g,
    label: g === "male" ? t("participantGender_male") : t("participantGender_female"),
  }));
}

export default function ChildPortalPage({ portalToken, toast }) {
  const { t, fmtDateDay, dir } = useLang();
  const [session, setSession] = useState(() => loadPortalSession(portalToken));
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [grade, setGrade] = useState("");

  const loadDashboard = useCallback(async (nonce) => {
    setDashLoading(true);
    try {
      const data = await fetchPortalDashboard(portalToken, nonce);
      if (data?.result !== "ok") {
        clearPortalSession(portalToken);
        setSession(null);
        setDashboard(null);
        setPinError(t("portalSessionExpired"));
        return;
      }
      setDashboard(data);
      setParentName(data.family?.parent_name || "");
      setPhone(data.family?.phone || "");
      setEmail(data.family?.email || "");
      setChildName(data.participant?.full_name || "");
      setBirthDate(data.participant?.birth_date || "");
      setGender(data.participant?.gender || "");
      setGrade(data.participant?.grade || "");
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setDashLoading(false);
  }, [portalToken, t, toast]);

  useEffect(() => {
    if (session?.nonce) loadDashboard(session.nonce);
  }, [session, loadDashboard]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError(null);
    const trimmed = pin.replace(/\D/g, "");
    if (trimmed.length !== 6) {
      setPinError(t("portalPinInvalid"));
      return;
    }
    setPinLoading(true);
    try {
      const data = await verifyPortalPin(portalToken, trimmed);
      if (data?.result === "ok") {
        const sess = { nonce: data.session_nonce, expiresAt: data.expires_at };
        savePortalSession(portalToken, sess);
        setSession(sess);
        setPin("");
      } else if (data?.result === "locked") {
        setPinError(t("portalPinLocked"));
      } else if (data?.result === "invalid_pin") {
        setPinError(t("portalPinWrong", { n: data.attempts_remaining ?? "?" }));
      } else {
        setPinError(t("portalNotFound"));
      }
    } catch (err) {
      setPinError(err.message || t("systemError"));
    }
    setPinLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!session?.nonce) return;
    setSavingProfile(true);
    try {
      const data = await updatePortalProfile(portalToken, session.nonce, {
        parent_name: parentName,
        phone,
        email,
        full_name: childName,
        birth_date: birthDate || null,
        gender: gender || null,
        grade: grade || null,
      });
      if (data?.result === "ok") {
        toast?.show(t("portalProfileSaved"));
        await loadDashboard(session.nonce);
      } else {
        toast?.show(t("systemError"));
      }
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setSavingProfile(false);
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !session?.nonce) return;
    if (!file.type.startsWith("image/")) {
      toast?.show(t("portalPhotoType"));
      return;
    }
    setUploadingPhoto(true);
    try {
      const b64 = await fileToBase64(file);
      const data = await setPortalPhoto(portalToken, session.nonce, b64, file.type);
      if (data?.result === "ok") {
        toast?.show(t("portalPhotoSaved"));
        await loadDashboard(session.nonce);
      } else if (data?.result === "photo_exists") {
        toast?.show(t("portalPhotoExists"));
      } else {
        toast?.show(t("systemError"));
      }
    } catch (err) {
      toast?.show(err.message || t("systemError"));
    }
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const upcoming = dashboard?.upcoming;
  const hasQr = upcoming?.has_entry && upcoming?.qr_token && !upcoming?.blocked_reason;
  const entries = Array.isArray(dashboard?.recent_entries) ? dashboard.recent_entries : [];

  return (
    <div className="child-portal assessment-landing" dir={dir}>
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <img
            src={LOGO_SRC}
            alt=""
            className="landing-nav-logo"
            onError={(ev) => { ev.currentTarget.src = LOGO_FALLBACK; }}
          />
          <span className="landing-nav-title">{t("portalTitle")}</span>
        </div>
        <LanguageSwitcher compact />
      </nav>

      <div className="child-portal-shell">
        {!session ? (
          <Card>
            <h1 className="page-title" style={{ fontSize: 22 }}>{t("portalPinTitle")}</h1>
            <p className="page-sub">{t("portalPinSub")}</p>
            <form onSubmit={handlePinSubmit}>
              <Field label={t("portalPinLabel")}>
                <Input
                  className="child-portal-pin-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(ev) => setPin(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                />
              </Field>
              {pinError && (
                <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{pinError}</p>
              )}
              <Button fullWidth type="submit" disabled={pinLoading} style={{ marginTop: 16 }}>
                {pinLoading ? <Spinner color="#fff" /> : t("portalEnter")}
              </Button>
            </form>
          </Card>
        ) : dashLoading && !dashboard ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner />
          </div>
        ) : (
          <>
            <Card className="child-portal-section">
              <div className="child-portal-section-title">{t("portalUpcoming")}</div>
              {!upcoming?.has_entry ? (
                <p className="child-portal-blocked">{t("portalNoUpcoming")}</p>
              ) : (
                <div className={`child-portal-qr-row ${hasQr ? "has-qr" : ""}`}>
                  {hasQr ? (
                    <div style={{ textAlign: "center" }}>
                      <PortalQRCanvas value={upcoming.qr_token} size={200} />
                      <p style={{ fontSize: 12, color: "var(--ink-mid)", marginTop: 8 }}>{t("showToGuard")}</p>
                    </div>
                  ) : (
                    <p className="child-portal-blocked">
                      {portalBlockedMessage(upcoming.blocked_reason, t)}
                    </p>
                  )}
                  <div className="child-portal-lesson-meta lesson-info" style={{ marginTop: 0 }}>
                    <div className="lesson-info-row">
                      <span className="li-key">{t("child")}</span>
                      <span className="li-val">{upcoming.child_name}</span>
                    </div>
                    <div className="lesson-info-row">
                      <span className="li-key">{t("date")}</span>
                      <span className="li-val">{fmtDateDay(upcoming.session_date)}</span>
                    </div>
                    <div className="lesson-info-row">
                      <span className="li-key">{t("startTime")}</span>
                      <span className="li-val">{fmt_time(upcoming.start_time)}</span>
                    </div>
                    {upcoming.product_name && (
                      <div className="lesson-info-row">
                        <span className="li-key">{t("sectionClass")}</span>
                        <span className="li-val">{upcoming.product_name}</span>
                      </div>
                    )}
                    <div className="lesson-info-row">
                      <span className="li-key">{t("instructor")}</span>
                      <span className="li-val">{upcoming.instructor_name}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <Card className="child-portal-section">
              <div className="child-portal-section-title">{t("portalDetails")}</div>
              <Field label={t("parentName")}>
                <Input value={parentName} onChange={(e) => setParentName(e.target.value)} />
              </Field>
              <Field label={t("phone")}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
              </Field>
              <Field label={t("email")}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              </Field>
              <Field label={t("child")}>
                <Input value={childName} onChange={(e) => setChildName(e.target.value)} />
              </Field>
              <Field label={t("birthDate")}>
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </Field>
              <Field label={t("gender")}>
                <Select value={gender} onChange={(e) => setGender(e.target.value)} options={[
                  { value: "", label: "—" },
                  ...genderOptions(t),
                ]} />
              </Field>
              <Field label={t("grade")}>
                <Select value={grade} onChange={(e) => setGrade(e.target.value)} options={[
                  { value: "", label: "—" },
                  ...PARTICIPANT_GRADES.map((g) => ({ value: g, label: g })),
                ]} />
              </Field>
              <Button fullWidth onClick={handleSaveProfile} disabled={savingProfile} style={{ marginTop: 8 }}>
                {savingProfile ? <Spinner color="#fff" /> : t("save")}
              </Button>

              <div style={{ marginTop: 20 }}>
                <div className="child-portal-section-title">{t("portalPhoto")}</div>
                {dashboard?.participant?.photo_url ? (
                  <img
                    src={dashboard.participant.photo_url}
                    alt=""
                    className="child-portal-photo-preview"
                  />
                ) : (
                  <div className="child-portal-photo-upload">
                    <p style={{ fontSize: 13, color: "var(--ink-mid)", textAlign: "center" }}>
                      {t("portalPhotoHint")}
                    </p>
                    <label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        hidden
                        onChange={handlePhotoChange}
                        disabled={uploadingPhoto}
                      />
                      <span className="btn btn-outline" style={{ display: "inline-flex", cursor: "pointer" }}>
                        {uploadingPhoto ? <Spinner /> : t("portalPhotoUpload")}
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </Card>

            {entries.length > 0 && (
              <Card className="child-portal-section">
                <div className="child-portal-section-title">{t("portalRecentEntries")}</div>
                {entries.map((row, i) => (
                  <div className="child-portal-entry-row" key={`${row.used_at}-${i}`}>
                    <span>{fmtDateDay(row.session_date)} · {fmt_time(row.start_time)}</span>
                    <span style={{ color: "var(--ink-mid)" }}>{row.label || row.instructor_name}</span>
                  </div>
                ))}
              </Card>
            )}

            <Button
              variant="outline"
              fullWidth
              style={{ marginTop: 16 }}
              onClick={() => {
                clearPortalSession(portalToken);
                setSession(null);
                setDashboard(null);
              }}
            >
              {t("portalLogout")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
