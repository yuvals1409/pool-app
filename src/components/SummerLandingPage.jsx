import { useState, useEffect, useRef } from "react";
import { useLang, LanguageSwitcher } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  getSummerInviteToken,
  getSummerInvite,
  registerSummerCourse,
} from "../lib/summerCourse.js";
import {
  getWaitlistOfferToken,
  getWaitlistOffer,
  joinWaitlist,
  registerFromWaitlistOffer,
} from "../lib/waitlist.js";
import "../styles/assessment-landing.css";

const LOGO_SRC = "/stream-line-logo.jpeg";
const LOGO_FALLBACK = "/logo.png";

function WaveDivider() {
  return (
    <div className="landing-wave" aria-hidden="true">
      <svg viewBox="0 0 1440 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,24 C240,48 480,0 720,24 C960,48 1200,0 1440,24 L1440,48 L0,48 Z"
          fill="var(--landing-surface)"
        />
      </svg>
    </div>
  );
}

function scrollToForm(formRef) {
  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getAssessmentRegisterUrl() {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  return `${base}/register/assessment`;
}

function RulesList({ items }) {
  return (
    <ul className="landing-rules-list">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

export default function SummerLandingPage({ toast }) {
  const { t, dir } = useLang();
  const token = getSummerInviteToken();
  const offerToken = getWaitlistOfferToken();
  const formRef = useRef(null);
  const [invite, setInvite] = useState(null);
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);

  const hasInvite = !!invite;
  const primaryCtaLabel = hasInvite ? t("summerLandingHeroCta") : t("summerLandingNoInviteCta");

  useEffect(() => {
    if (offerToken) {
      (async () => {
        try {
          const data = await getWaitlistOffer(offerToken);
          if (data?.result !== "ok") {
            setErrorMsg({
              not_found: t("waitlistOfferNotFound"),
              invalid: t("waitlistOfferInvalid"),
              expired: t("waitlistOfferExpired"),
            }[data?.result] || t("systemError"));
          } else {
            setOffer(data);
          }
        } catch (e) {
          setErrorMsg(e.message || t("systemError"));
        }
        setLoading(false);
      })();
      return;
    }

    if (!token) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await getSummerInvite(token);
        if (data?.result !== "ok") {
          setErrorMsg({
            not_found: t("summerInviteNotFound"),
            already_used: t("summerInviteUsed"),
            expired: t("summerInviteExpired"),
            cancelled: t("summerInviteCancelled"),
          }[data?.result] || t("systemError"));
        } else {
          setInvite(data);
          const available = (data.courses || []).filter((c) => !c.is_full);
          if (available.length === 1) setSelectedId(available[0].id);
        }
      } catch (e) {
        setErrorMsg(e.message || t("systemError"));
      }
      setLoading(false);
    })();
  }, [token, offerToken, t]);

  useEffect(() => {
    if (offerToken || loading) return undefined;
    const onScroll = () => {
      if (!hasInvite) {
        setShowStickyCta(false);
        return;
      }
      const formTop = formRef.current?.getBoundingClientRect().top ?? Infinity;
      setShowStickyCta(formTop > window.innerHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [offerToken, loading, hasInvite]);

  const selectedCourse = invite?.courses?.find((c) => c.id === selectedId);
  const isFull = selectedCourse?.is_full;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      setErrorMsg(t("selectSummerCourseRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setWaitlistSuccess(null);
    try {
      if (isFull) {
        const data = await joinWaitlist({
          targetType: "product",
          targetId: selectedId,
          childName: invite.child_name,
          phone: invite.parent_phone,
          parentName: invite.parent_name,
          summerInviteToken: token,
        });
        if (data?.result === "ok") {
          setWaitlistSuccess(data.position);
          toast?.show(t("waitlistJoined", { n: data.position }));
        } else {
          setErrorMsg({
            already_on_waitlist: t("waitlistAlreadyJoined"),
            not_full: t("waitlistNotFull"),
            invite_invalid: t("summerInviteInvalid"),
          }[data?.result] || t("systemError"));
        }
      } else {
        const data = await registerSummerCourse(token, selectedId);
        if (data?.result === "ok") {
          setRegisterSuccess(true);
          return;
        }
        setErrorMsg({
          course_full: t("summerCourseFull"),
          duplicate_enrollment: t("duplicateEnrollment"),
          already_used: t("summerInviteUsed"),
          invite_invalid: t("summerInviteInvalid"),
        }[data?.result] || t("systemError"));
      }
    } catch (err) {
      setErrorMsg(err.message || t("systemError"));
    }
    setSubmitting(false);
  };

  const handleOfferRegister = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const data = await registerFromWaitlistOffer(offerToken);
      if (data?.result === "ok") {
        setRegisterSuccess(true);
        return;
      }
      setErrorMsg({
        expired: t("waitlistOfferExpired"),
        spot_taken: t("waitlistSpotTaken"),
        course_full: t("summerCourseFull"),
        already_used: t("waitlistOfferUsed"),
      }[data?.result] || t("systemError"));
    } catch (err) {
      setErrorMsg(err.message || t("systemError"));
    }
    setSubmitting(false);
  };

  const handlePrimaryCta = () => {
    if (hasInvite) {
      scrollToForm(formRef);
    } else {
      window.location.href = getAssessmentRegisterUrl();
    }
  };

  const bringItems = [
    { icon: "👙", label: t("summerLandingBringSwimsuit") },
    { icon: "🎩", label: t("summerLandingBringCap") },
    { icon: "🥽", label: t("summerLandingBringGoggles") },
    { icon: "🧺", label: t("summerLandingBringTowel") },
    { icon: "💧", label: t("summerLandingBringWater") },
    { icon: "🩴", label: t("summerLandingBringSandals") },
  ];

  const arrivalRules = [
    t("summerLandingArrival1"),
    t("summerLandingArrival2"),
    t("summerLandingArrival3"),
    t("summerLandingArrival4"),
    t("summerLandingArrival5"),
    t("summerLandingArrival6"),
  ];

  const nonMemberRules = [
    t("summerLandingNonMember1"),
    t("summerLandingNonMember2"),
    t("summerLandingNonMember3"),
  ];

  if (loading) {
    return (
      <div className="assessment-landing" dir={dir}>
        <div className="landing-loading">{t("loading")}</div>
      </div>
    );
  }

  if (offerToken && offer) {
    return (
      <div className="assessment-landing" dir={dir}>
        <div className="landing-offer-wrap">
          <div className="landing-offer-card">
            <img
              src={LOGO_SRC}
              alt={t("logoAlt")}
              style={{ height: 48, marginBottom: 16 }}
              onError={(e) => { e.currentTarget.src = LOGO_FALLBACK; }}
            />
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("waitlistOfferTitle")}</h1>
            <p style={{ color: "var(--landing-muted)", marginBottom: 24, fontSize: 14 }}>
              {t("waitlistOfferSubtitleSummer")}
            </p>
            <div className="lesson-info" style={{ marginBottom: 20, textAlign: "start" }}>
              <div className="lesson-info-row">
                <span className="li-key">{t("child")}</span>
                <span className="li-val">{offer.child_name}</span>
              </div>
            </div>
            {errorMsg && (
              <div className="result-card err" style={{ marginBottom: 16, padding: 12 }}>
                <div className="result-detail">{errorMsg}</div>
              </div>
            )}
            {offer.already_promoted ? (
              <div className="result-card ok" style={{ padding: 12 }}>{t("waitlistOfferUsed")}</div>
            ) : (
              <button
                className="landing-cta-btn"
                type="button"
                disabled={submitting}
                onClick={handleOfferRegister}
                style={{ width: "100%" }}
              >
                {submitting ? <><div className="spinner" /> {t("saving")}</> : t("waitlistConfirmRegister")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const courses = invite?.courses || [];

  return (
    <div className="assessment-landing summer-landing" dir={dir}>
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <img
            src={LOGO_SRC}
            alt={t("logoAlt")}
            onError={(e) => { e.currentTarget.src = LOGO_FALLBACK; }}
          />
          <span>Stream Line</span>
        </div>
        <div className="landing-nav-actions">
          <LanguageSwitcher compact />
          <button type="button" className="landing-cta-btn" onClick={handlePrimaryCta}>
            <span className="landing-nav-cta-text">{primaryCtaLabel}</span>
            <span aria-hidden="true">🌞</span>
          </button>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-inner">
          <span className="landing-badge">{t("summerLandingHeroBadge")}</span>
          <h1>{t("summerLandingHeroTitle")}</h1>
          <p className="landing-hero-sub">{t("summerLandingHeroSub")}</p>
          <p className="landing-hero-intro">{t("summerLandingHeroIntro")}</p>
          <button type="button" className="landing-cta-btn" onClick={handlePrimaryCta}>
            {primaryCtaLabel}
          </button>
          {!hasInvite && (
            <p className="landing-hero-note">{t("summerLandingNoInviteNote")}</p>
          )}
        </div>
        <WaveDivider />
      </header>

      <div className="landing-stats">
        <div className="landing-stat">
          <div className="landing-stat-icon">⏰</div>
          <div className="landing-stat-value">10</div>
          <div className="landing-stat-label">{t("summerLandingStatEarlyLabel")}</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-icon">🔄</div>
          <div className="landing-stat-value">2</div>
          <div className="landing-stat-label">{t("summerLandingStatMakeupLabel")}</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-icon">⏱️</div>
          <div className="landing-stat-value landing-stat-value--ltr">1:15</div>
          <div className="landing-stat-label">{t("summerLandingStatStayLabel")}</div>
        </div>
      </div>

      <section className="landing-section">
        <h2 className="landing-section-title">{t("summerLandingBringTitle")}</h2>
        <ul className="landing-prep-list">
          {bringItems.map(({ icon, label }) => (
            <li key={label}>
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-grid-2">
          <div className="landing-card-block">
            <h3>📌 {t("summerLandingArrivalTitle")}</h3>
            <RulesList items={arrivalRules} />
          </div>
          <div className="landing-card-block">
            <h3>🚿 {t("summerLandingShowersTitle")}</h3>
            <p className="landing-card-lead">{t("summerLandingShowersBody")}</p>
            <div className="landing-divider" />
            <h3>🔄 {t("summerLandingMakeupTitle")}</h3>
            <p className="landing-card-lead">{t("summerLandingMakeupBody")}</p>
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-card-block landing-warning-card">
          <h3>🚫 {t("summerLandingNonMemberTitle")}</h3>
          <RulesList items={nonMemberRules} />
          <div className="landing-warning-note">
            <span aria-hidden="true">⚠️</span>
            <span>{t("summerLandingNonMemberWarning")}</span>
          </div>
        </div>
      </section>

      {hasInvite && (
        <section className="landing-section landing-form-section" ref={formRef} id="register">
          <h2 className="landing-section-title">{t("summerLandingFormTitle")}</h2>
          <p className="landing-section-sub">{t("summerLandingFormSub")}</p>

          <div className="landing-form-card">
            <div className="lesson-info" style={{ marginBottom: 20 }}>
              <div className="lesson-info-row">
                <span className="li-key">{t("child")}</span>
                <span className="li-val">{invite.child_name}</span>
              </div>
              {invite.parent_name && (
                <div className="lesson-info-row">
                  <span className="li-key">{t("parentNameOptional")}</span>
                  <span className="li-val">{invite.parent_name}</span>
                </div>
              )}
            </div>

            {courses.length === 0 ? (
              <div className="empty" style={{ textAlign: "center" }}>
                <div className="empty-icon">📅</div>
                <div className="empty-text">{t("noSummerCourses")}</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label className="label">{t("selectSummerCourse")}</label>
                  <select
                    className="input"
                    value={selectedId}
                    onChange={(e) => {
                      setSelectedId(e.target.value);
                      setWaitlistSuccess(null);
                    }}
                  >
                    <option value="">{t("selectSummerCoursePlaceholder")}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {fmt_time(c.start_time)}
                        {c.is_full ? ` · ${t("waitlistFull")}` : ` · ${t("spotsLeft", { n: c.spots_left })}`}
                      </option>
                    ))}
                  </select>
                </div>

                {registerSuccess && (
                  <div className="result-card ok" style={{ marginBottom: 16, padding: 12 }}>
                    <div className="result-detail">{t("summerPendingOffice")}</div>
                  </div>
                )}

                {waitlistSuccess != null && (
                  <div className="result-card ok" style={{ marginBottom: 16, padding: 12 }}>
                    <div className="result-detail">{t("waitlistJoined", { n: waitlistSuccess })}</div>
                  </div>
                )}

                {errorMsg && (
                  <div className="result-card err" style={{ marginBottom: 16, padding: 12 }}>
                    <div className="result-detail">{errorMsg}</div>
                  </div>
                )}

                <button className="landing-cta-btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
                  {submitting ? <><div className="spinner" /> {t("saving")}</> : (
                    isFull ? t("joinWaitlist") : t("registerSummerCourse")
                  )}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {!hasInvite && errorMsg && token && (
        <section className="landing-section" style={{ paddingTop: 0 }}>
          <div className="result-card err" style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
            <div className="result-detail">{errorMsg}</div>
          </div>
        </section>
      )}

      <section className="landing-section landing-thanks-section">
        <div className="landing-thanks-card">
          <span className="landing-thanks-icon" aria-hidden="true">💙</span>
          <h2>{t("summerLandingThanksTitle")}</h2>
          <p>{t("summerLandingThanksBody")}</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-slogan">"{t("summerLandingSlogan")}"</div>
        <div className="landing-footer-waiting">{t("summerLandingFooterTeam")}</div>
        <div className="landing-contact">
          <a href="tel:0525458965">052-5458965</a>
        </div>
        <div className="landing-location">{t("landingLocation")}</div>
      </footer>

      {showStickyCta && (
        <div className="landing-sticky-cta">
          <button type="button" className="landing-cta-btn" onClick={handlePrimaryCta}>
            {primaryCtaLabel}
          </button>
        </div>
      )}
    </div>
  );
}
