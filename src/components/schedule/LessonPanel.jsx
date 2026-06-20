import { useState } from "react";
import { useLang } from "../../i18n.jsx";
import { AnimatedSheetOverlay, AnimatedSheetPanel } from "../ui/AnimatedSheet.jsx";
import ParentContactPicker from "../ParentContactPicker.jsx";
import { canEditLesson } from "../../lib/permissions.js";
import { fmt_time, isPastLesson, isValidStartTime, lessonStatus } from "../../lib/lessonDates.js";
import TimeScrollPicker from "../TimeScrollPicker.jsx";
import { Button, Field, Input, Select, SegmentedControl, Spinner } from "../ui/ds/index.js";

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
  toast,
  layout = "sheet",
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

  const content = (
    <>
      {layout === "sheet" && <div className="schedule-panel-handle" />}
      {layout === "inline" && (
        <div className="schedule-rail-header">
          <div className="section-title" style={{ fontSize: 17, margin: 0 }}>
            {mode === "create" ? t("newLesson") : mode === "view" && editMode ? t("editLesson") : t("lessonDetails")}
          </div>
          <button type="button" className="schedule-rail-close" onClick={onClose} aria-label={t("cancel")}>✕</button>
        </div>
      )}

      {mode === "create" && (
        <>
          {layout === "sheet" && (
            <>
              <div className="section-title" style={{ fontSize: 17 }}>{t("newLesson")}</div>
              <div className="section-sub" style={{ marginBottom: 16 }}>{t("createLessonHere")}</div>
            </>
          )}
          {showInstructorPicker && (
            <Field label={t("selectInstructor")}>
              <Select
                value={form.instructor_id}
                onChange={e => setForm(f => ({ ...f, instructor_id: e.target.value }))}
              >
                <option value="">{t("selectInstructor")}</option>
                {instructors.map(inst => (
                  <option key={inst.id} value={inst.id}>{inst.full_name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t("childName")}>
            <Input value={form.child_name}
              onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))} dir={dir} />
          </Field>
          <Field label={t("lessonDate")}>
            <div className="date-input-wrap">
              <Input type="date" dir="ltr" value={form.lesson_date}
                onChange={e => setForm(f => ({ ...f, lesson_date: e.target.value }))} />
            </div>
          </Field>
          <Field label={t("lessonStartTime")}>
            <TimeScrollPicker value={form.start_time}
              onChange={v => setForm(f => ({ ...f, start_time: v }))} />
          </Field>
          <Field label={t("parentPhone")}>
            <ParentContactPicker
              value={form.parent_phone}
              onChange={phone => setForm(f => ({ ...f, parent_phone: phone }))}
              onError={msg => toast?.show(msg)}
            />
          </Field>
          <Field label={t("lessonType")}>
            <SegmentedControl
              options={[
                { value: "once", label: t("lessonOnce") },
                { value: "recurring", label: t("lessonRecurring") },
              ]}
              value={form.lesson_type}
              onChange={v => setForm(f => ({ ...f, lesson_type: v }))}
            />
          </Field>
          <div className="gap-8">
            <Button variant="primary" onClick={handleCreate} disabled={acting}>
              {acting ? <><Spinner size={16} /> {t("creating")}</> : t("createBarcode")}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={acting}>{t("cancel")}</Button>
          </div>
        </>
      )}

      {mode === "view" && lesson && !editMode && (
        <>
          {layout === "sheet" && (
            <div className="section-title" style={{ fontSize: 17 }}>{t("lessonDetails")}</div>
          )}
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
              <Button variant="secondary" onClick={enterEditMode} disabled={acting}>
                ✎ {t("editLesson")}
              </Button>
              <Button variant="danger" onClick={requestCancel} disabled={acting}>
                ✕ {t("cancelLesson")}
              </Button>
            </div>
          )}
          {layout === "sheet" && (
            <Button variant="secondary" onClick={onClose} style={{ marginTop: 16 }}>{t("cancel")}</Button>
          )}
        </>
      )}

      {mode === "view" && lesson && editMode && (
        <>
          {layout === "sheet" && (
            <>
              <div className="section-title" style={{ fontSize: 17 }}>{t("editLesson")}</div>
              <div className="section-sub" style={{ marginBottom: 16 }}>{t("editLessonSub")}</div>
            </>
          )}
          <Field label={t("childName")}>
            <Input value={form.child_name}
              onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))} dir={dir} />
          </Field>
          <Field label={t("lessonDate")}>
            <div className="date-input-wrap">
              <Input type="date" dir="ltr" value={form.lesson_date}
                onChange={e => setForm(f => ({ ...f, lesson_date: e.target.value }))} />
            </div>
            {isRecurring && (
              <div className="schedule-readonly-hint" style={{ marginTop: 6 }}>{t("recurringDateHint")}</div>
            )}
          </Field>
          <Field label={t("lessonStartTime")}>
            <TimeScrollPicker value={form.start_time}
              onChange={v => setForm(f => ({ ...f, start_time: v }))} />
          </Field>
          <Field label={t("parentPhone")}>
            <ParentContactPicker
              value={form.parent_phone}
              onChange={phone => setForm(f => ({ ...f, parent_phone: phone }))}
              onError={msg => toast?.show(msg)}
            />
          </Field>
          <div className="gap-8">
            <Button variant="primary" onClick={handleSave} disabled={acting}>
              {acting ? <><Spinner size={16} /> {t("preparingImage")}</> : t("saveAndNotify")}
            </Button>
            <Button variant="secondary" onClick={() => { if (lesson) setForm(lessonToForm(lesson)); setEditMode(false); }} disabled={acting}>{t("cancel")}</Button>
          </div>
        </>
      )}

      {phonePrompt && (
        <>
          <div className="section-title" style={{ fontSize: 17 }}>{t("cancelLesson")}</div>
          <div className="section-sub" style={{ marginBottom: 16 }}>
            {t("cancelConfirm", { name: lesson.child_name })}
          </div>
          <Field label={t("parentPhone")}>
            <ParentContactPicker
              value={form.parent_phone}
              onChange={phone => setForm(f => ({ ...f, parent_phone: phone }))}
              onError={msg => toast?.show(msg)}
            />
          </Field>
          <div className="gap-8">
            <Button variant="danger" onClick={confirmCancelWithPhone} disabled={acting}>
              {acting ? <><Spinner size={16} /> {t("saving")}</> : t("sendCancelWhatsApp")}
            </Button>
            <Button variant="secondary" onClick={() => setPhonePrompt(false)} disabled={acting}>{t("cancel")}</Button>
          </div>
        </>
      )}
    </>
  );

  if (layout === "inline") {
    return (
      <div className="schedule-rail-panel">
        {content}
      </div>
    );
  }

  return (
    <AnimatedSheetOverlay onClose={onClose}>
      <AnimatedSheetPanel onClick={e => e.stopPropagation()}>
        {content}
      </AnimatedSheetPanel>
    </AnimatedSheetOverlay>
  );
}
