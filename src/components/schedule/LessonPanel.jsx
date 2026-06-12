import { useState } from "react";
import { useLang } from "../../i18n.jsx";
import { canEditLesson } from "../../lib/permissions.js";
import { fmt_time, isPastLesson, isValidStartTime, lessonStatus } from "../../lib/lessonDates.js";
import TimeScrollPicker from "../TimeScrollPicker.jsx";

const blankForm = () => ({
  child_name: "",
  lesson_date: "",
  start_time: "09:00",
  parent_phone: "",
  lesson_type: "once",
  instructor_id: "",
});

function lessonToForm(lesson) {
  return {
    child_name: lesson.child_name,
    lesson_date: lesson.lesson_date,
    start_time: lesson.start_time?.slice(0, 5) || "09:00",
    parent_phone: lesson.parent_phone || "",
    lesson_type: "once",
    instructor_id: lesson.instructor_id || "",
  };
}

export default function LessonPanel({
  mode,
  lesson,
  profile,
  instructors,
  showInstructorPicker,
  initialForm,
  onClose,
  onSave,
  onCancel,
  onCreate,
  acting,
}) {
  const { t, fmtDateDay, dir } = useLang();
  const [form, setForm] = useState(() => {
    if (mode === "create") return { ...blankForm(), ...initialForm };
    if (lesson) return lessonToForm(lesson);
    return blankForm();
  });
  const [editMode, setEditMode] = useState(mode === "create" || mode === "edit");
  const [phonePrompt, setPhonePrompt] = useState(false);

  const editable = lesson && canEditLesson(profile, lesson);
  const status = lesson ? lessonStatus(lesson) : null;
  const past = lesson ? isPastLesson(lesson) : false;
  const isRecurring = Boolean(lesson?.recurring_lesson_id);

  const enterEditMode = () => {
    if (lesson) setForm(lessonToForm(lesson));
    setEditMode(true);
  };

  const handleSave = () => {
    const { child_name, lesson_date, start_time, parent_phone } = form;
    if (!child_name || !lesson_date || !start_time || !parent_phone) return onSave?.({ error: t("fillAllFields") });
    if (!isValidStartTime(start_time)) return onSave?.({ error: t("invalidTime") });
    if (mode === "create" && showInstructorPicker && !form.instructor_id) {
      return onSave?.({ error: t("selectInstructor") });
    }
    if (lesson && !lesson.recurring_lesson_id && !confirm(t("editConfirm", { name: child_name }))) return;
    onSave?.({ form, lesson });
  };

  const handleCreate = () => {
    const { child_name, lesson_date, start_time, parent_phone } = form;
    if (!child_name || !lesson_date || !start_time || !parent_phone) return onCreate?.({ error: t("fillAllFields") });
    if (!isValidStartTime(start_time)) return onCreate?.({ error: t("invalidTime") });
    if (showInstructorPicker && !form.instructor_id) return onCreate?.({ error: t("selectInstructor") });
    onCreate?.({ form });
  };

  const requestCancel = () => {
    if (!lesson.parent_phone) {
      setPhonePrompt(true);
      return;
    }
    if (!lesson.recurring_lesson_id && !confirm(t("cancelConfirm", { name: lesson.child_name }))) return;
    onCancel?.({ lesson, phone: lesson.parent_phone });
  };

  const confirmCancelWithPhone = () => {
    if (!form.parent_phone) return onCancel?.({ error: t("phoneRequiredForNotify") });
    if (!lesson.recurring_lesson_id && !confirm(t("cancelConfirm", { name: lesson.child_name }))) return;
    onCancel?.({ lesson, phone: form.parent_phone });
  };

  return (
    <div className="schedule-panel-overlay" onClick={onClose}>
      <div className="schedule-panel" onClick={e => e.stopPropagation()}>
        <div className="schedule-panel-handle" />

        {mode === "create" && (
          <>
            <div className="section-title" style={{ fontSize: 17 }}>{t("newLesson")}</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>{t("createLessonHere")}</div>
            {showInstructorPicker && (
              <div className="field">
                <label className="label">{t("selectInstructor")}</label>
                <select
                  className="input"
                  value={form.instructor_id}
                  onChange={e => setForm(f => ({ ...f, instructor_id: e.target.value }))}
                >
                  <option value="">{t("selectInstructor")}</option>
                  {instructors.map(inst => (
                    <option key={inst.id} value={inst.id}>{inst.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label className="label">{t("childName")}</label>
              <input className="input" value={form.child_name}
                onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))} dir={dir} />
            </div>
            <div className="field">
              <label className="label">{t("lessonDate")}</label>
              <input className="input" type="date" value={form.lesson_date}
                onChange={e => setForm(f => ({ ...f, lesson_date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">{t("lessonStartTime")}</label>
              <TimeScrollPicker value={form.start_time}
                onChange={v => setForm(f => ({ ...f, start_time: v }))} />
            </div>
            <div className="field">
              <label className="label">{t("parentPhone")}</label>
              <input className="input" type="tel" value={form.parent_phone}
                onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="field">
              <label className="label">{t("lessonType")}</label>
              <div className="mode-switch">
                <button type="button" className={`mode-btn ${form.lesson_type === "once" ? "active" : ""}`}
                  onClick={() => setForm(f => ({ ...f, lesson_type: "once" }))}>{t("lessonOnce")}</button>
                <button type="button" className={`mode-btn ${form.lesson_type === "recurring" ? "active" : ""}`}
                  onClick={() => setForm(f => ({ ...f, lesson_type: "recurring" }))}>{t("lessonRecurring")}</button>
              </div>
            </div>
            <div className="gap-8">
              <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={acting}>
                {acting ? <><div className="spinner" /> {t("creating")}</> : t("createBarcode")}
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={acting}>{t("cancel")}</button>
            </div>
          </>
        )}

        {mode === "view" && lesson && !editMode && (
          <>
            <div className="section-title" style={{ fontSize: 17 }}>{t("lessonDetails")}</div>
            {past && <div className="schedule-readonly-hint" style={{ marginBottom: 12 }}>{t("pastLesson")}</div>}
            <div className="lesson-info">
              <div className="lesson-info-row"><span className="li-key">{t("child")}</span><span className="li-val">{lesson.child_name}</span></div>
              <div className="lesson-info-row"><span className="li-key">{t("date")}</span><span className="li-val">{fmtDateDay(lesson.lesson_date)}</span></div>
              <div className="lesson-info-row"><span className="li-key">{t("startTime")}</span><span className="li-val">{fmt_time(lesson.start_time)}</span></div>
              <div className="lesson-info-row"><span className="li-key">{t("instructor")}</span><span className="li-val">{lesson.instructor_name}</span></div>
              <div className="lesson-info-row">
                <span className="li-key">{t("statusLabel")}</span>
                <span className="li-val">
                  {status === "used" ? t("used") : status === "cancelled" ? t("cancelled") : t("waiting")}
                </span>
              </div>
            </div>
            {editable && (
              <div className="gap-8" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={enterEditMode} disabled={acting}>
                  ✎ {t("editLesson")}
                </button>
                <button type="button" className="btn btn-danger" onClick={requestCancel} disabled={acting}>
                  ✕ {t("cancelLesson")}
                </button>
              </div>
            )}
            <button type="button" className="btn btn-outline mt-16" onClick={onClose}>{t("cancel")}</button>
          </>
        )}

        {mode === "view" && lesson && editMode && (
          <>
            <div className="section-title" style={{ fontSize: 17 }}>{t("editLesson")}</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>{t("editLessonSub")}</div>
            <div className="field">
              <label className="label">{t("childName")}</label>
              <input className="input" value={form.child_name}
                onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))} dir={dir} />
            </div>
            <div className="field">
              <label className="label">{t("lessonDate")}</label>
              <input className="input" type="date" value={form.lesson_date}
                onChange={e => setForm(f => ({ ...f, lesson_date: e.target.value }))} />
              {isRecurring && (
                <div className="schedule-readonly-hint" style={{ marginTop: 6 }}>{t("recurringDateHint")}</div>
              )}
            </div>
            <div className="field">
              <label className="label">{t("lessonStartTime")}</label>
              <TimeScrollPicker value={form.start_time}
                onChange={v => setForm(f => ({ ...f, start_time: v }))} />
            </div>
            <div className="field">
              <label className="label">{t("parentPhone")}</label>
              <input className="input" type="tel" value={form.parent_phone}
                onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="gap-8">
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={acting}>
                {acting ? <><div className="spinner" /> {t("preparingImage")}</> : t("saveAndNotify")}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => { if (lesson) setForm(lessonToForm(lesson)); setEditMode(false); }} disabled={acting}>{t("cancel")}</button>
            </div>
          </>
        )}

        {phonePrompt && (
          <>
            <div className="section-title" style={{ fontSize: 17 }}>{t("cancelLesson")}</div>
            <div className="section-sub" style={{ marginBottom: 16 }}>
              {t("cancelConfirm", { name: lesson.child_name })}
            </div>
            <div className="field">
              <label className="label">{t("parentPhone")}</label>
              <input className="input" type="tel" placeholder="050-0000000" value={form.parent_phone}
                onChange={e => setForm(f => ({ ...f, parent_phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="gap-8">
              <button type="button" className="btn btn-danger" onClick={confirmCancelWithPhone} disabled={acting}>
                {acting ? <><div className="spinner" /> {t("saving")}</> : t("sendCancelWhatsApp")}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setPhonePrompt(false)} disabled={acting}>{t("cancel")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
