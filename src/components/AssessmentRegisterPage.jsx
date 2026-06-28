import { useState, useEffect, useRef } from "react";
import { useLang, LanguageSwitcher } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { listAssessmentSlots, registerForAssessment } from "../lib/assessment.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import { LANDING_VIDEO_URL } from "../lib/config.js";
import {
  PARTICIPANT_GRADES,
  gradeRequired,
  resolveBirthDate,
  validateParticipantFields,
} from "../lib/participantFields.js";
import {
  getWaitlistOfferToken,
  getWaitlistOffer,
  joinWaitlist,
  registerFromWaitlistOffer,
} from "../lib/waitlist.js";
import "../styles/assessment-landing.css";

const LOGO_SRC = "/stream-line-logo-mark.png";
const LOGO_FALLBACK = "/stream-line-logo.jpeg";
const HERO_LOGO_SRC = "/stream-line-logo-mark.png";
const DEFAULT_VIDEO_ID = "e5_8GMmtdDQ";
const WEEKDAY_TIMES = ["16:30", "17:15", "18:00"];
const FRIDAY_TIMES = ["13:30", "14:15", "15:00"];

const BUBBLES = [
  { left: "8%", size: 14, delay: 0, duration: 11 },
  { left: "18%", size: 9, delay: 0.8, duration: 8 },
  { left: "28%", size: 20, delay: 1.2, duration: 14 },
  { left: "38%", size: 7, delay: 2, duration: 9 },
  { left: "48%", size: 12, delay: 0.4, duration: 12 },
  { left: "58%", size: 16, delay: 1.6, duration: 10 },
  { left: "66%", size: 8, delay: 0.2, duration: 13 },
  { left: "74%", size: 11, delay: 1, duration: 9.5 },
  { left: "82%", size: 18, delay: 2.4, duration: 15 },
  { left: "90%", size: 10, delay: 0.6, duration: 11.5 },
  { left: "14%", size: 6, delay: 1.8, duration: 7.5 },
  { left: "54%", size: 9, delay: 2.8, duration: 10.5 },
];

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

function parseYoutubeId(url) {
  if (!url) return DEFAULT_VIDEO_ID;
  const match = url.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{11})/);
  return match?.[1] || DEFAULT_VIDEO_ID;
}

function scrollToForm(formRef) {
  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function useLandingEffects(rootRef) {
  const progressRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const bar = progressRef.current;
    const bubbles = root.querySelector("#sl-bubbles");
    const heroPhoto = root.querySelector("#sl-hero-photo");

    const counters = Array.from(root.querySelectorAll("[data-count]"));
    const reveals = Array.from(root.querySelectorAll("[data-reveal]"));
    const revealItems = (el) => (el.hasAttribute("data-stagger") ? Array.from(el.children) : [el]);

    if (!reduce) {
      counters.forEach((el) => { el.textContent = `0${el.dataset.suffix || ""}`; });
    }

    const runCount = (el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      const duration = 1200;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        el.textContent = `${Math.round(target * eased).toLocaleString("en-US")}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (!reduce) {
      reveals.forEach((el) => {
        revealItems(el).forEach((item, index) => {
          item.style.opacity = "0";
          item.style.transform = "translateY(30px)";
          item.style.transition = "opacity .65s cubic-bezier(.22,.61,.36,1), transform .65s cubic-bezier(.22,.61,.36,1)";
          item.style.transitionDelay = `${el.hasAttribute("data-stagger") ? index * 90 : 0}ms`;
        });
      });
    }

    const showCounter = (el) => {
      if (el.dataset.done) return;
      el.dataset.done = "1";
      runCount(el);
    };

    const showReveal = (el) => {
      if (el.dataset.done) return;
      el.dataset.done = "1";
      revealItems(el).forEach((item) => {
        item.style.opacity = "1";
        item.style.transform = "none";
      });
    };

    const forceReveal = (el) => {
      if (el.dataset.done) return;
      el.dataset.done = "1";
      revealItems(el).forEach((item) => {
        item.style.transition = "none";
        item.style.opacity = "1";
        item.style.transform = "none";
      });
    };

    let ticking = false;
    const applyScroll = () => {
      ticking = false;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, (scrollTop / max) * 100))}%`;
      if (!reduce && bubbles) bubbles.style.transform = `translateY(${scrollTop * 0.22}px)`;
      if (!reduce && heroPhoto) heroPhoto.style.transform = `translateY(${scrollTop * -0.045}px)`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(applyScroll);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    applyScroll();

    if (reduce || !("IntersectionObserver" in window)) {
      counters.forEach(showCounter);
      reveals.forEach(showReveal);
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.dataset.count != null) showCounter(el);
        else showReveal(el);
        observer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    counters.forEach((el) => observer.observe(el));
    reveals.forEach((el) => observer.observe(el));

    const fallback = window.setTimeout(() => {
      counters.forEach(showCounter);
      reveals.forEach(forceReveal);
    }, 1300);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [rootRef]);

  return progressRef;
}

function DayChip({ label, variant = "default" }) {
  return <span className={`landing-day-chip${variant === "friday" ? " friday" : ""}`}>{label}</span>;
}

function TimeChips({ times, variant = "default" }) {
  return (
    <div className="landing-schedule-times">
      {times.map((time) => (
        <span
          key={time}
          className={`landing-time-chip${variant === "friday" ? " friday" : ""}`}
          dir="ltr"
        >
          {time}
        </span>
      ))}
    </div>
  );
}

export default function AssessmentRegisterPage({ toast }) {
  const { t, fmtDateDay, dir } = useLang();
  const offerToken = getWaitlistOfferToken();
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const progressRef = useLandingEffects(rootRef);
  const videoId = parseYoutubeId(LANDING_VIDEO_URL);

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childGender, setChildGender] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [birthDate, setBirthDate] = useState("");
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
  const ageNumPreview = childAge.trim() ? Number(childAge) : null;
  const showGrade = gradeRequired({
    birthDate: birthDate || null,
    childAge: Number.isInteger(ageNumPreview) ? ageNumPreview : null,
  });

  const resultMessage = (result) => ({
    invalid_input: t("assessmentInvalidInput"),
    slot_not_found: t("assessmentSlotUnavailable"),
    slot_unavailable: t("assessmentSlotUnavailable"),
    slot_full: t("slotFull"),
    duplicate_enrollment: t("duplicateEnrollment"),
    invalid_gender: t("participantGenderRequired"),
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

    const resolvedBirth = resolveBirthDate({ birthDate: birthDate || null, childAge: ageNum });
    const fieldErr = validateParticipantFields({
      gender: childGender,
      grade: childGrade || null,
      birthDate: resolvedBirth,
      childAge: ageNum,
    }, { t });
    if (fieldErr) {
      setErrorMsg(fieldErr);
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
          source: "website",
          gender: childGender,
          grade: childGrade || null,
          birthDate: resolvedBirth,
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

  const expectItems = [
    { icon: "🏅", tone: "blue", text: t("landingExpect1") },
    { icon: "⭐", tone: "coral", text: t("landingExpect2") },
    { icon: "👥", tone: "blue", text: t("landingExpect3") },
    { icon: "🏊", tone: "blue", text: t("landingExpect4") },
  ];

  const prepItems = [
    { icon: "🧢", text: t("landingPrepCap") },
    { icon: "🧺", text: t("landingPrepTowel") },
    { icon: "👙", text: t("landingPrepSwimsuit") },
    { icon: "🥽", text: t("landingPrepGoggles") },
    { icon: "😊", text: t("landingPrepMood") },
  ];

  const schedulePairs = [
    { days: [t("landingDaySun"), t("landingDayWed")], times: WEEKDAY_TIMES },
    { days: [t("landingDayMon"), t("landingDayThu")], times: WEEKDAY_TIMES },
    {
      split: true,
      blocks: [
        { label: t("landingScheduleWedHours"), days: [t("landingDayTue")], times: WEEKDAY_TIMES },
        { label: t("landingScheduleFriHours"), days: [t("landingDayFri")], times: FRIDAY_TIMES, friday: true },
      ],
    },
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
            <img src={LOGO_SRC} alt={t("logoAlt")} style={{ height: 48, marginBottom: 16 }} onError={(e) => { e.currentTarget.src = LOGO_FALLBACK; }} />
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
                className="landing-cta-btn landing-cta-btn--hero"
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

  return (
    <div className="assessment-landing" dir={dir} ref={rootRef}>
      <div ref={progressRef} id="sl-progress" className="landing-progress" aria-hidden="true" />

      <div className="landing-lang-float">
        <LanguageSwitcher compact className="landing-lang-switcher" />
      </div>

      <header className="landing-hero">
        <div id="sl-bubbles" className="landing-hero-bubbles-rise" aria-hidden="true">
          {BUBBLES.map((bubble) => (
            <span
              key={`${bubble.left}-${bubble.delay}`}
              style={{
                left: bubble.left,
                width: bubble.size,
                height: bubble.size,
                animationDuration: `${bubble.duration}s`,
                animationDelay: `${bubble.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="landing-hero-inner">
          <div className="landing-hero-logo-wrap">
            <img
              className="landing-hero-logo"
              src={HERO_LOGO_SRC}
              alt={t("logoAlt")}
              onError={(e) => { e.currentTarget.src = LOGO_FALLBACK; }}
            />
          </div>

          <h1>{t("landingHeroTitle")}</h1>
          <p className="landing-hero-sub">{t("landingHeroSub")}</p>

          <div className="landing-hero-actions">
            <button type="button" className="landing-cta-btn landing-cta-btn--hero" onClick={() => scrollToForm(formRef)}>
              {t("landingHeroCta")}
            </button>
            <span className="landing-hero-note">{t("landingHeroNote")}</span>
          </div>

          <div id="sl-hero-photo" className="landing-hero-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1`}
              title={t("landingVideoTitle")}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>

          <div className="landing-hero-trust" data-reveal data-stagger>
            <div className="landing-trust-item">
              <div className="landing-trust-emoji">💙</div>
              <div className="landing-trust-label">{t("landingTrustApproach")}</div>
            </div>
            <div className="landing-trust-item">
              <div className="landing-trust-number" data-count="700" data-suffix="+" dir="ltr">700+</div>
              <div className="landing-trust-label">{t("landingTrustChildrenCount")}</div>
            </div>
            <div className="landing-trust-item">
              <div className="landing-trust-number" data-count="20" data-suffix="+" dir="ltr">20+</div>
              <div className="landing-trust-label">{t("landingTrustYearsCount")}</div>
            </div>
          </div>
        </div>

        <div className="landing-hero-waves" aria-hidden="true">
          <div className="landing-wave-track landing-wave-track--back">
            <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="landing-wave-svg" aria-hidden="true">
              <path d="M0,52 C360,88 720,16 1080,52 C1260,68 1350,44 1440,52 V100 H0 Z" fill="#90E0EF" />
            </svg>
            <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="landing-wave-svg" aria-hidden="true">
              <path d="M0,52 C360,88 720,16 1080,52 C1260,68 1350,44 1440,52 V100 H0 Z" fill="#90E0EF" />
            </svg>
          </div>
          <div className="landing-wave-track landing-wave-track--front">
            <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="landing-wave-svg" aria-hidden="true">
              <path d="M0,58 C480,96 960,20 1440,58 V100 H0 Z" fill="#F0F8FF" />
            </svg>
            <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="landing-wave-svg" aria-hidden="true">
              <path d="M0,58 C480,96 960,20 1440,58 V100 H0 Z" fill="#F0F8FF" />
            </svg>
          </div>
        </div>
      </header>

      <section className="landing-section landing-stats-section">
        <div className="landing-stats" data-reveal>
          <div className="landing-stat">
            <div className="landing-stat-icon">⏱️</div>
            <div className="landing-stat-value landing-stat-value--ltr" data-count="45" dir="ltr">45</div>
            <div className="landing-stat-label">{t("landingStatMinutes")}</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-icon">📅</div>
            <div className="landing-stat-value landing-stat-value--ltr" data-count="12" dir="ltr">12</div>
            <div className="landing-stat-label">{t("landingStatSessions")}</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-icon">👥</div>
            <div className="landing-stat-value landing-stat-value--ltr" data-count="6" dir="ltr">6</div>
            <div className="landing-stat-label">{t("landingStatGroupMax")}</div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <div className="landing-section-eyebrow">{t("landingSectionEyebrow")}</div>
          <h2 className="landing-section-title">{t("landingExpectTitle")}</h2>
        </div>
        <div className="landing-benefits" data-reveal data-stagger>
          {expectItems.map((item) => (
            <div key={item.text} className="landing-benefit-card">
              <div className={`landing-benefit-icon-box tone-${item.tone}`}>{item.icon}</div>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-course-section">
        <div className="landing-section-head">
          <div className="landing-section-eyebrow">{t("landingScheduleEyebrow")}</div>
          <h2 className="landing-section-title">{t("landingCourseTitle")}</h2>
        </div>

        <div className="landing-course-panel" data-reveal>
          <div className="landing-course-panel-head">
            <div className="landing-course-panel-icon">🏊</div>
            <div>
              <div className="landing-course-panel-title">{t("landingCourseTitle")}</div>
              <div className="landing-course-panel-sub">{t("landingScheduleSubtitle")}</div>
            </div>
          </div>

          <div className="landing-schedule-lock">
            <span aria-hidden="true">🔒</span>
            <span>{t("landingScheduleLock")}</span>
          </div>

          <div className="landing-schedule-rows">
            {schedulePairs.map((pair) => (
              pair.split ? (
                <div key="split" className="landing-schedule-row landing-schedule-row--split">
                  <div className="landing-schedule-row-days">
                    <DayChip label={pair.blocks[0].days[0]} />
                    <span className="landing-schedule-plus">+</span>
                    <DayChip label={pair.blocks[1].days[0]} variant="friday" />
                  </div>
                  <div className="landing-schedule-split-blocks">
                    {pair.blocks.map((block) => (
                      <div key={block.label} className="landing-schedule-split-block">
                        <div className={`landing-schedule-hours-label${block.friday ? " friday" : ""}`}>{block.label}</div>
                        <TimeChips times={block.times} variant={block.friday ? "friday" : "default"} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={pair.days.join("-")} className="landing-schedule-row">
                  <div className="landing-schedule-row-days">
                    <DayChip label={pair.days[0]} />
                    <span className="landing-schedule-plus">+</span>
                    <DayChip label={pair.days[1]} />
                  </div>
                  <div className="landing-schedule-row-times">
                    <div className="landing-schedule-hours-label">{t("landingScheduleHours")}</div>
                    <TimeChips times={pair.times} />
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <div className="landing-section-eyebrow">{t("landingPricingEyebrow")}</div>
          <h2 className="landing-section-title">{t("landingPricingTitle")}</h2>
        </div>
        <div className="landing-pricing" data-reveal>
          <div className="landing-price-card">
            <div className="landing-price-tier">{t("landingPriceMember")}</div>
            <div className="landing-price-amount" dir="ltr">₪1,250</div>
          </div>
          <div className="landing-price-card featured">
            <div className="landing-price-badge">{t("landingPriceRecommended")}</div>
            <div className="landing-price-tier">{t("landingPriceSubscriber")}</div>
            <div className="landing-price-amount featured" dir="ltr">₪1,400</div>
          </div>
          <div className="landing-price-card">
            <div className="landing-price-tier">{t("landingPriceExternal")}</div>
            <div className="landing-price-amount" dir="ltr">₪1,600</div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-assessment-section">
        <div className="landing-assessment-card" data-reveal>
          <div className="landing-assessment-waves" aria-hidden="true" />
          <div className="landing-assessment-inner">
            <h2 className="landing-assessment-title">{t("landingAssessmentTitle")}</h2>
            <p className="landing-assessment-lead">{t("landingAssessmentSub")}</p>
            <p className="landing-assessment-bring">{t("landingAssessmentBring")}</p>
            <div className="landing-prep-pills">
              {prepItems.map((item) => (
                <span key={item.text} className="landing-prep-pill">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-form-section" ref={formRef} id="register">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t("landingFormTitle")}</h2>
          <p className="landing-section-sub">{t("assessmentSubtitle")}</p>
        </div>

        {!hasAnySlot ? (
          <div className="empty" style={{ textAlign: "center" }}>
            <div className="empty-text">{t("noSlotsAvailable")}</div>
          </div>
        ) : (
          <div className="landing-form-card" data-reveal>
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
                <label className="label" htmlFor="child-name">{t("landingChildNameLabel")}</label>
                <input
                  id="child-name"
                  className="input"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
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
                    dir="ltr"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="child-gender">{t("participantGenderLabel")}</label>
                  <select
                    id="child-gender"
                    className="input"
                    value={childGender}
                    onChange={(e) => setChildGender(e.target.value)}
                  >
                    <option value="">{t("participantGenderLabel")}</option>
                    <option value="male">{t("participantGender_male")}</option>
                    <option value="female">{t("participantGender_female")}</option>
                  </select>
                </div>
              </div>

              <div className="landing-form-fields-row">
                <div className="field">
                  <label className="label" htmlFor="birth-date">{t("participantBirthDateLabel")}</label>
                  <input
                    id="birth-date"
                    className="input"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    dir="ltr"
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="child-grade">
                    {t("participantGradeLabel")}
                    {!showGrade && (
                      <span style={{ fontSize: 12, color: "var(--ink-soft)", marginInlineStart: 6 }}>
                        ({t("participantGradeOptionalAdult")})
                      </span>
                    )}
                  </label>
                  <select
                    id="child-grade"
                    className="input"
                    value={childGrade}
                    onChange={(e) => setChildGrade(e.target.value)}
                    disabled={!showGrade}
                  >
                    <option value="">{showGrade ? t("participantGradeLabel") : "—"}</option>
                    {PARTICIPANT_GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="parent-name">{t("landingParentNameLabel")}</label>
                <input
                  id="parent-name"
                  className="input"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="parent-phone">{t("landingParentPhoneLabel")}</label>
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

              <button className="landing-cta-btn landing-cta-btn--submit" type="submit" disabled={submitting} style={{ width: "100%" }}>
                {submitting ? <><div className="spinner" /> {t("saving")}</> : (
                  isFull ? t("joinWaitlist") : t("landingFormSubmit")
                )}
              </button>
            </form>
          </div>
        )}
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-waves" aria-hidden="true" />
        <div className="landing-footer-inner">
          <h2 className="landing-slogan">&ldquo;{t("landingSlogan")}&rdquo;</h2>
          <p className="landing-footer-waiting">{t("landingFooterWaiting")}</p>
          <p className="landing-footer-team">{t("landingFooterTeam")}</p>
          <a href="tel:0525458965" className="landing-footer-phone" dir="ltr">052-5458965</a>
          <p className="landing-location">{t("landingLocation")}</p>
        </div>
      </footer>

      {showStickyCta && (
        <div className="landing-sticky-cta">
          <button type="button" className="landing-cta-btn landing-cta-btn--hero" onClick={() => scrollToForm(formRef)}>
            {t("landingHeroCta")}
          </button>
        </div>
      )}
    </div>
  );
}
