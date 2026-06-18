import { useState, useEffect } from "react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import { listAssessmentSlots, registerForAssessment } from "../lib/assessment.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import {
  getWaitlistOfferToken,
  getWaitlistOffer,
  joinWaitlist,
  registerFromWaitlistOffer,
} from "../lib/waitlist.js";

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

export default function AssessmentRegisterPage({ toast }) {
  const { t, fmtDateDay } = useLang();
  const offerToken = getWaitlistOfferToken();
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
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>
        {t("loading")}
      </div>
    );
  }

  if (offerToken && offer) {
    return (
      <div style={{ padding: "24px 20px", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8, textAlign: "center" }}>{t("waitlistOfferTitle")}</h1>
        <p style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>
          {t("waitlistOfferSubtitle")}
        </p>
        <div className="lesson-info" style={{ marginBottom: 20 }}>
          <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{offer.child_name}</span></div>
        </div>
        {errorMsg && (
          <div className="result-card err" style={{ marginBottom: 16, padding: 12 }}>
            <div className="result-detail">{errorMsg}</div>
          </div>
        )}
        {offer.already_promoted ? (
          <div className="result-card ok" style={{ padding: 12 }}>{t("waitlistOfferUsed")}</div>
        ) : (
          <button className="btn btn-primary" type="button" disabled={submitting} onClick={handleOfferRegister} style={{ width: "100%" }}>
            {submitting ? <><div className="spinner" /> {t("saving")}</> : t("waitlistConfirmRegister")}
          </button>
        )}
      </div>
    );
  }

  const hasAnySlot = slots.length > 0;

  return (
    <div style={{ padding: "24px 20px", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8, textAlign: "center" }}>{t("assessmentTitle")}</h1>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>
        {t("assessmentSubtitle")}
      </p>

      {!hasAnySlot ? (
        <div className="empty">
          <div className="empty-icon">📅</div>
          <div className="empty-text">{t("noSlotsAvailable")}</div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">{t("selectAssessmentSlot")}</label>
            <select
              className="input"
              value={selectedSlotId}
              onChange={(e) => { setSelectedSlotId(e.target.value); setWaitlistSuccess(null); }}
            >
              <option value="">{t("selectAssessmentSlotPlaceholder")}</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {fmtDateDay(slot.slot_date)} · {fmt_time(slot.start_time)}
                  {slot.is_full ? ` · ${t("waitlistFull")}` : ` · ${t("spotsLeft", { n: slot.spots_left })}`}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">{t("child")}</label>
            <input
              className="input"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder={t("child")}
            />
          </div>

          <div className="field">
            <label className="label">{t("childAge")}</label>
            <input
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
            <label className="label">{t("parentNameOptional")}</label>
            <input
              className="input"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">{t("parentPhone")}</label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
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

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? <><div className="spinner" /> {t("saving")}</> : (
              isFull ? t("joinWaitlist") : t("registerForAssessment")
            )}
          </button>
        </form>
      )}
    </div>
  );
}
