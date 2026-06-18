import { useState, useEffect, useRef } from "react";
import { useLang, LanguageSwitcher } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { listAssessmentSlots, registerForAssessment } from "../lib/assessment.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import {
  getWaitlistOfferToken,
  getWaitlistOffer,
  joinWaitlist,
  registerFromWaitlistOffer,
} from "../lib/waitlist.js";
import "../styles/assessment-landing.css";

const LOGO_SRC = "/logo.png";

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

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

export default function AssessmentRegisterPage({ toast }) {
  const { t, fmtDateDay, dir } = useLang();
  const offerToken = getWaitlistOfferToken();
  const formRef = useRef(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState(null);
  const [offer, setOffer] = useState(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  const loadSlots = async () => {
    setLoading(true);
    try {
      const rows = await listAssessmentSlots();
      setSlots(rows);
      const available = rows.filter((s) => !s.is_full);
      if (available.length === 1) setSelectedSlotId(available[0].id);
    } catch (e) {
      setErrorMsg(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (offerToken) {
      (async () => {
        setLoading(true);
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
            setChildName(data.child_name || "");
            setParentName(data.parent_name || "");
            setPhone(data.phone || "");
            if (data.child_age) setChildAge(String(data.child_age));
          }
        } catch (e) {
          setErrorMsg(e.message);
        }
        setLoading(false);
      })();
    } else {
      loadSlots();
    }
  }, [offerToken, t]);

  useEffect(() => {
    if (offerToken) return undefined;
    const onScroll = () => {
      const formTop = formRef.current?.getBoundingClientRect().top ?? Infinity;
      setShowStickyCta(formTop > window.innerHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [offerToken, loading]);

  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  const isFull = selectedSlot?.is_full;

  const resultMessage = (result) => ({
    invalid_input: t("assessmentInvalidInput"),
    slot_not_found: t("assessmentSlotUnavailable"),
    slot_unavailable: t("assessmentSlotUnavailable"),
    slot_full: t("slotFull"),
    duplicate_enrollment: t("duplicateEnrollment"),
    not_full: t("waitlistNotFull"),
    already_on_waitlist: t("waitlistAlreadyJoined"),
    target_unavailable: t("assessmentSlotUnavailable"),
  }[result] || t("systemError"));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setWaitlistSuccess(null);

    if (!selectedSlotId) {
      setErrorMsg(t("selectAssessmentSlotRequired"));
      return;
    }
    if (!childName.trim()) {
      setErrorMsg(t("childRequired"));
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setErrorMsg(t("phoneRequired"));
      return;
    }

    const ageNum = childAge.trim() ? Number(childAge) : null;
    if (childAge.trim() && (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120)) {
      setErrorMsg(t("assessmentInvalidAge"));
      return;
    }

    setSubmitting(true);
    try {
      if (isFull) {
        const data = await joinWaitlist({
          targetType: "assessment_slot",
          targetId: selectedSlotId,
          childName: childName.trim(),
          phone: normalizedPhone,
          parentName: parentName.trim() || null,
          childAge: ageNum,
        });
        if (data?.result === "ok") {
          setWaitlistSuccess(data.position);
          toast?.show(t("waitlistJoined", { n: data.position }));
        } else {
          setErrorMsg(resultMessage(data?.result));
        }
      } else {
        const data = await registerForAssessment({
          slotId: selectedSlotId,
          childName: childName.trim(),
          childAge: ageNum,
          parentName: parentName.trim() || null,
          phone: normalizedPhone,
          source: "landing",
        });

        if (data?.result === "ok" && data.public_token) {
          window.location.href = getPublicPassUrl(data.public_token);
          return;
        }

        setErrorMsg(resultMessage(data?.result));
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
      if (data?.result === "ok" && data.public_token) {
        window.location.href = getPublicPassUrl(data.public_token);
        return;
      }
      setErrorMsg({
        expired: t("waitlistOfferExpired"),
        spot_taken: t("waitlistSpotTaken"),
        slot_full: t("slotFull"),
        already_used: t("waitlistOfferUsed"),
      }[data?.result] || t("systemError"));
    } catch (err) {
      setErrorMsg(err.message || t("systemError"));
    }
    setSubmitting(false);
  };

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
            <img src={LOGO_SRC} alt={t("logoAlt")} style={{ height: 48, marginBottom: 16 }} />
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("waitlistOfferTitle")}</h1>
            <p style={{ color: "var(--landing-muted)", marginBottom: 24, fontSize: 14 }}>
              {t("waitlistOfferSubtitle")}
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

  const hasAnySlot = slots.length > 0;
  const benefits = [
    t("landingBenefit1"),
    t("landingBenefit2"),
    t("landingBenefit3"),
    t("landingBenefit4"),
  ];
  const habituationItems = [
    t("landingHabituation1"),
    t("landingHabituation2"),
    t("landingHabituation3"),
    t("landingHabituation4"),
  ];
  const prepItems = [
    { icon: "🥽", label: t("landingPrepGoggles") },
    { icon: "👙", label: t("landingPrepSwimsuit") },
    { icon: "🧺", label: t("landingPrepTowel") },
    { icon: "🎩", label: t("landingPrepCap") },
    { icon: "😊", label: t("landingPrepMood") },
  ];

  return (
    <div className="assessment-landing" dir={dir}>
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <img src={LOGO_SRC} alt={t("logoAlt")} />
          <span>Stream Line</span>
        </div>
        <div className="landing-nav-actions">
          <LanguageSwitcher compact />
          <button
            type="button"
            className="landing-cta-btn"
            onClick={() => scrollToForm(formRef)}
          >
            <span className="landing-nav-cta-text">{t("landingHeroCta")}</span>
            <span aria-hidden="true">🏊</span>
          </button>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-inner">
          <span className="landing-badge">{t("landingHeroBadge")}</span>
          <h1>{t("landingHeroTitle")}</h1>
          <p className="landing-hero-sub">{t("landingHeroSub")}</p>
          <button
            type="button"
            className="landing-cta-btn"
            onClick={() => scrollToForm(formRef)}
          >
            {t("landingHeroCta")}
          </button>
          <p className="landing-hero-note">{t("landingHeroNote")}</p>
        </div>
        <WaveDivider />
      </header>

      <div className="landing-stats">
        <div className="landing-stat">
          <div className="landing-stat-icon">👥</div>
          <div className="landing-stat-value">6</div>
          <div className="landing-stat-label">{t("landingStatGroups")}</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-icon">📅</div>
          <div className="landing-stat-value">12</div>
          <div className="landing-stat-label">{t("landingStatSessions")}</div>
        </div>
        <div className="landing-stat">
          <div className="landing-stat-icon">⏱️</div>
          <div className="landing-stat-value">45</div>
          <div className="landing-stat-label">{t("landingStatDuration")}</div>
        </div>
      </div>

      <section className="landing-section">
        <h2 className="landing-section-title">{t("landingBenefitsTitle")}</h2>
        <p className="landing-section-sub">{t("landingSeasonStart")}</p>
        <div className="landing-benefits">
          {benefits.map((text) => (
            <div key={text} className="landing-benefit">
              <span className="landing-benefit-check" aria-hidden="true">✓</span>
              <span className="landing-benefit-text">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-grid-2">
          <div className="landing-card-block">
            <h3>🏊 {t("landingCourseTitle")}</h3>
            <p style={{ margin: "0 0 16px", color: "var(--landing-muted)", fontSize: "0.9375rem" }}>
              {t("landingCourseSub")}
            </p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--landing-muted)" }}>
                {t("landingCourseDays")}
              </div>
              <div className="landing-schedule-row">
                {["landingDayPair1", "landingDayPair2", "landingDayPair3"].map((key) => (
                  <span key={key} className="landing-schedule-chip">{t(key)}</span>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--landing-muted)" }}>
                {t("landingCourseWeekdayHours")}
              </div>
              <div className="landing-schedule-times">
                {["16:30", "17:15", "18:00"].map((time) => (
                  <span key={time} className="landing-time-chip">{time}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: 8, color: "var(--landing-muted)" }}>
                {t("landingCourseFridayHours")}
              </div>
              <div className="landing-schedule-times">
                {["13:30", "14:15", "15:00"].map((time) => (
                  <span key={time} className="landing-time-chip">{time}</span>
                ))}
              </div>
            </div>
            <div className="landing-note">{t("landingCourseNote")}</div>
          </div>

          <div className="landing-card-block">
            <h3>💧 {t("landingHabituationTitle")}</h3>
            <p style={{ margin: "0 0 16px", color: "var(--landing-muted)", fontSize: "0.9375rem" }}>
              {t("landingHabituationSub")}
            </p>
            <ul className="landing-habituation-items">
              {habituationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <h2 className="landing-section-title">{t("landingPricingTitle")}</h2>
        <p className="landing-section-sub">{t("landingPricingSub")}</p>
        <div className="landing-pricing">
          <div className="landing-price-card">
            <div className="landing-price-tier">{t("landingPricingExternal")}</div>
            <div className="landing-price-amount">1,600 <span>₪</span></div>
          </div>
          <div className="landing-price-card featured">
            <div className="landing-price-tier">{t("landingPricingMember")}</div>
            <div className="landing-price-amount">1,400 <span>₪</span></div>
          </div>
          <div className="landing-price-card">
            <div className="landing-price-tier">{t("landingPricingShareholder")}</div>
            <div className="landing-price-amount">1,250 <span>₪</span></div>
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-card-block" style={{ maxWidth: 720, margin: "0 auto" }}>
          <h3 style={{ textAlign: "center", justifyContent: "center" }}>🎯 {t("landingAssessmentTitle")}</h3>
          <p style={{ textAlign: "center", margin: "0 0 24px", color: "var(--landing-muted)" }}>
            {t("landingAssessmentSub")}
          </p>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
            {t("landingAssessmentBring")}
          </div>
          <ul className="landing-prep-list">
            {prepItems.map(({ icon, label }) => (
              <li key={label}>
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-section landing-form-section" ref={formRef} id="register">
        <h2 className="landing-section-title">{t("landingFormTitle")}</h2>
        <p className="landing-section-sub">{t("landingFormSub")}</p>

        {!hasAnySlot ? (
          <div className="empty" style={{ textAlign: "center" }}>
            <div className="empty-icon">📅</div>
            <div className="empty-text">{t("noSlotsAvailable")}</div>
          </div>
        ) : (
          <div className="landing-form-card">
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="label">{t("selectAssessmentSlot")}</label>
                <div className="landing-slot-grid" role="radiogroup" aria-label={t("selectAssessmentSlot")}>
                  {slots.map((slot) => {
                    const selected = selectedSlotId === slot.id;
                    return (
                      <label
                        key={slot.id}
                        className={`landing-slot-option${selected ? " selected" : ""}${slot.is_full ? " full" : ""}`}
                      >
                        <input
                          type="radio"
                          name="slot"
                          value={slot.id}
                          checked={selected}
                          onChange={() => {
                            setSelectedSlotId(slot.id);
                            setWaitlistSuccess(null);
                          }}
                        />
                        <div>
                          <div className="landing-slot-date">
                            {fmtDateDay(slot.slot_date)} · {fmt_time(slot.start_time)}
                          </div>
                        </div>
                        <span className={`landing-slot-badge ${slot.is_full ? "full" : "available"}`}>
                          {slot.is_full ? t("waitlistFull") : t("spotsLeft", { n: slot.spots_left })}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="child-name">{t("child")}</label>
                <input
                  id="child-name"
                  className="input"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder={t("child")}
                  autoComplete="name"
                />
              </div>

              <div className="landing-form-fields-row">
                <div className="field">
                  <label className="label" htmlFor="child-age">{t("childAge")}</label>
                  <input
                    id="child-age"
                    className="input"
                    type="number"
                    min={1}
                    max={120}
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    placeholder={t("childAgeOptional")}
                    dir="ltr"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="parent-name">{t("parentNameOptional")}</label>
                  <input
                    id="parent-name"
                    className="input"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="parent-phone">{t("parentPhone")}</label>
                <input
                  id="parent-phone"
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  autoComplete="tel"
                />
              </div>

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
                  isFull ? t("joinWaitlist") : t("registerForAssessment")
                )}
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <div className="landing-trust">
          <div className="landing-trust-item">
            <div className="landing-trust-number">20+</div>
            <div className="landing-trust-label">{t("landingTrustYears")}</div>
          </div>
          <div className="landing-trust-item">
            <div className="landing-trust-number">100+</div>
            <div className="landing-trust-label">{t("landingTrustChildren")}</div>
          </div>
          <div className="landing-trust-item">
            <div className="landing-trust-number">💙</div>
            <div className="landing-trust-label">{t("landingTrustApproach")}</div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-slogan">"{t("landingSlogan")}"</div>
        <div className="landing-contact">
          <div style={{ marginBottom: 8 }}>{t("landingContact")}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("landingContactName")}</div>
          <a href="tel:0525458965">052-5458965</a>
        </div>
        <div className="landing-location">{t("landingLocation")}</div>
      </footer>

      {showStickyCta && (
        <div className="landing-sticky-cta">
          <button
            type="button"
            className="landing-cta-btn"
            onClick={() => scrollToForm(formRef)}
          >
            {t("landingHeroCta")}
          </button>
        </div>
      )}
    </div>
  );
}
