import { useState, useEffect } from "react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  getSummerInviteToken,
  getSummerInvite,
  registerSummerCourse,
} from "../lib/summerCourse.js";
import { getPublicPassUrl } from "../lib/accessPass.js";
import {
  getWaitlistOfferToken,
  getWaitlistOffer,
  joinWaitlist,
  registerFromWaitlistOffer,
} from "../lib/waitlist.js";

import "../styles/assessment-landing.css";

export default function SummerRegisterPage({ toast }) {
  const { t } = useLang();
  const token = getSummerInviteToken();
  const offerToken = getWaitlistOfferToken();
  const [invite, setInvite] = useState(null);
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState(null);

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
      setErrorMsg(t("summerInviteMissing"));
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
        if (data?.result === "ok" && data.public_token) {
          window.location.href = getPublicPassUrl(data.public_token);
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
      if (data?.result === "ok" && data.public_token) {
        window.location.href = getPublicPassUrl(data.public_token);
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

  if (loading) {
    return <div className="assessment-landing loading-center">{t("loading")}</div>;
  }

  if (offerToken && offer) {
    return (
      <div className="assessment-landing landing-page-shell">
        <h1 className="page-title">{t("waitlistOfferTitle")}</h1>
        <p className="page-sub">{t("waitlistOfferSubtitleSummer")}</p>
        <div className="lesson-info">
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

  if (errorMsg && !invite) {
    return (
      <div className="result-card err" style={{ margin: 24 }}>
        <div className="result-detail">{errorMsg}</div>
      </div>
    );
  }

  const courses = invite?.courses || [];

  return (
    <div className="assessment-landing landing-page-shell">
      <h1 className="page-title">{t("summerRegisterTitle")}</h1>
      <p className="page-sub">{t("summerRegisterSubtitle")}</p>

      <div className="lesson-info">
        <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{invite.child_name}</span></div>
        {invite.parent_name && (
          <div className="lesson-info-row"><span className="li-key">{t("parentNameOptional")}</span><span className="li-val">{invite.parent_name}</span></div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📅</div>
          <div className="empty-text">{t("noSummerCourses")}</div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">{t("selectSummerCourse")}</label>
            <select className="input" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setWaitlistSuccess(null); }}>
              <option value="">{t("selectSummerCoursePlaceholder")}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {fmt_time(c.start_time)}
                  {c.is_full ? ` · ${t("waitlistFull")}` : ` · ${t("spotsLeft", { n: c.spots_left })}`}
                </option>
              ))}
            </select>
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
              isFull ? t("joinWaitlist") : t("registerSummerCourse")
            )}
          </button>
        </form>
      )}
    </div>
  );
}
