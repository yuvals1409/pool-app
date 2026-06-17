import { useState, useEffect } from "react";
import { useLang } from "../i18n.jsx";
import { fmt_time } from "../lib/lessonDates.js";
import {
  getSummerInviteToken,
  getSummerInvite,
  registerSummerCourse,
} from "../lib/summerCourse.js";
import { getPublicPassUrl } from "../lib/accessPass.js";

export default function SummerRegisterPage({ toast }) {
  const { t } = useLang();
  const token = getSummerInviteToken();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
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
          if (data.courses?.length === 1) setSelectedId(data.courses[0].id);
        }
      } catch (e) {
        setErrorMsg(e.message || t("systemError"));
      }
      setLoading(false);
    })();
  }, [token, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      setErrorMsg(t("selectSummerCourseRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
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
    } catch (err) {
      setErrorMsg(err.message || t("systemError"));
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>{t("loading")}</div>;
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
    <div style={{ padding: "24px 20px", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8, textAlign: "center" }}>{t("summerRegisterTitle")}</h1>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>
        {t("summerRegisterSubtitle")}
      </p>

      <div className="lesson-info" style={{ marginBottom: 20 }}>
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
            <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">{t("selectSummerCoursePlaceholder")}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {fmt_time(c.start_time)} · {t("spotsLeft", { n: c.spots_left })}
                </option>
              ))}
            </select>
          </div>
          {errorMsg && (
            <div className="result-card err" style={{ marginBottom: 16, padding: 12 }}>
              <div className="result-detail">{errorMsg}</div>
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? <><div className="spinner" /> {t("saving")}</> : t("registerSummerCourse")}
          </button>
        </form>
      )}
    </div>
  );
}
