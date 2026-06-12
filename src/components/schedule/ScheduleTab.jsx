import { useCallback, useEffect, useState } from "react";
import { useLang } from "../../i18n.jsx";
import { supabase, ensureWeeklyLessonsGenerated } from "../../lib/supabase.js";
import {
  canEditSchedule, canManage, canViewAllInstructors,
} from "../../lib/permissions.js";
import { getViewDateRange, toLocalDateStr, parseDateStr } from "../../lib/lessonDates.js";
import { buildInstructorMap } from "../../lib/instructorColors.js";
import {
  updateLesson, cancelLesson, createAndNotify, RECURRING_SCOPE,
} from "../../lib/lessonMutations.js";
import ScheduleToolbar from "./ScheduleToolbar.jsx";
import MonthView from "./MonthView.jsx";
import WeekView from "./WeekView.jsx";
import DayView from "./DayView.jsx";
import InstructorLegend from "./InstructorLegend.jsx";
import LessonPanel from "./LessonPanel.jsx";
import RecurringScopeDialog from "./RecurringScopeDialog.jsx";
import { useLessonDrag } from "./useLessonDrag.jsx";
import "./schedule.css";

export default function ScheduleTab({ profile, toast }) {
  const i18n = useLang();
  const { t } = i18n;
  const canEdit = canEditSchedule(profile);
  const showLegend = canViewAllInstructors(profile);
  const showInstructorPicker = canManage(profile);

  const [view, setView] = useState("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [instructors, setInstructors] = useState([]);

  const [panel, setPanel] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureWeeklyLessonsGenerated();
    const { start, end } = getViewDateRange(view, anchorDate);
    let q = supabase.from("lessons").select("*")
      .gte("lesson_date", toLocalDateStr(start))
      .lte("lesson_date", toLocalDateStr(end))
      .order("lesson_date")
      .order("start_time");
    if (!canViewAllInstructors(profile)) q = q.eq("instructor_id", profile.id);
    const { data } = await q;
    setLessons(data || []);
    setLoading(false);
  }, [view, anchorDate, profile.id, profile.role]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showInstructorPicker) return;
    supabase.from("profiles").select("*")
      .eq("role", "instructor")
      .eq("status", "approved")
      .order("full_name")
      .then(({ data }) => setInstructors(data || []));
  }, [showInstructorPicker]);

  const instructorLegend = showLegend ? buildInstructorMap(lessons) : [];

  const navigate = (dir) => {
    setAnchorDate(d => {
      const next = new Date(d);
      if (view === "day") next.setDate(next.getDate() + dir);
      else if (view === "week") next.setDate(next.getDate() + dir * 7);
      else next.setMonth(next.getMonth() + dir);
      return next;
    });
  };

  const handleDrop = useCallback((lesson, date, time) => {
    if (!canEdit) return;
    if (date !== lesson.lesson_date) return;
    if (!confirm(t("rescheduleConfirm", { name: lesson.child_name, time }))) return;
    const updates = { lesson_date: lesson.lesson_date, start_time: time };
    if (lesson.recurring_lesson_id) {
      setPendingAction({ type: "reschedule", lesson, updates });
    } else {
      performUpdate(lesson, updates, RECURRING_SCOPE.SINGLE);
    }
  }, [canEdit, t]);

  const { startDrag, dropTarget, ghost } = useLessonDrag({
    enabled: canEdit,
    onDrop: handleDrop,
  });

  const performUpdate = async (lesson, updates, scope) => {
    setActing(true);
    const result = await updateLesson({
      lesson,
      updates: {
        child_name: updates.child_name,
        lesson_date: updates.lesson_date,
        start_time: updates.start_time,
        parent_phone: updates.parent_phone,
      },
      scope,
      toast,
      i18n,
      phone: updates.parent_phone || lesson.parent_phone,
    });
    if (result.error) toast.show(`${t("editError")}: ${result.error.message}`);
    else toast.show(t("lessonUpdated"));
    setActing(false);
    setPanel(null);
    setPendingAction(null);
    load();
  };

  const performCancel = async (lesson, scope, phone) => {
    setActing(true);
    const result = await cancelLesson({ lesson, scope, phone, toast, i18n });
    if (result.error) toast.show(`${t("cancelError")}: ${result.error.message}`);
    else toast.show(t("lessonCancelled"));
    setActing(false);
    setPanel(null);
    setPendingAction(null);
    load();
  };

  const handleScopeChoose = (scopeKey) => {
    const scope = scopeKey === "forward" ? RECURRING_SCOPE.FORWARD : RECURRING_SCOPE.SINGLE;
    const action = pendingAction;
    if (!action) return;
    const { lesson } = action;

    if (action.type === "cancel") {
      if (!confirm(t("cancelConfirm", { name: lesson.child_name }))) return;
      performCancel(lesson, scope, action.phone);
      return;
    }

    const confirmMsg = action.type === "reschedule"
      ? t("rescheduleConfirm", { name: lesson.child_name, time: action.updates.start_time })
      : t("editConfirm", { name: lesson.child_name });
    if (!confirm(confirmMsg)) return;

    if (action.type === "reschedule") {
      performUpdate(lesson, action.updates, scope);
    } else {
      performUpdate(lesson, action.form || action.updates, scope);
    }
  };

  const onLessonClick = (lesson) => setPanel({ mode: "view", lesson });

  const onSlotClick = (date, time) => {
    if (!canEdit) return;
    setPanel({
      mode: "create",
      initial: { lesson_date: date, start_time: time },
    });
  };

  const onDayClick = (dateStr) => {
    setAnchorDate(parseDateStr(dateStr));
    setView("day");
  };

  const handlePanelSave = ({ form, lesson, error }) => {
    if (error) return toast.show(error);
    const updates = {
      child_name: form.child_name,
      lesson_date: form.lesson_date,
      start_time: form.start_time,
      parent_phone: form.parent_phone,
    };
    if (lesson.recurring_lesson_id) {
      setPanel(null);
      setPendingAction({ type: "edit", lesson, form: updates });
      return;
    }
    performUpdate(lesson, updates, RECURRING_SCOPE.SINGLE);
  };

  const handlePanelCancel = ({ lesson, phone, error }) => {
    if (error) return toast.show(error);
    if (lesson.recurring_lesson_id) {
      setPanel(null);
      setPendingAction({ type: "cancel", lesson, phone });
      return;
    }
    performCancel(lesson, RECURRING_SCOPE.SINGLE, phone);
  };

  const handlePanelCreate = async ({ form, error }) => {
    if (error) return toast.show(error);
    setActing(true);
    const instructor = showInstructorPicker
      ? instructors.find(i => i.id === form.instructor_id)
      : profile;
    const result = await createAndNotify({
      profile,
      instructor,
      form,
      toast,
      i18n,
    });
    if (result.error) toast.show(`${t("createError")}: ${result.error.message}`);
    else toast.show(t("barcodeReady"));
    setActing(false);
    setPanel(null);
    load();
  };

  const viewProps = {
    anchorDate,
    lessons,
    onLessonClick,
    onSlotClick,
    onDayClick,
    onDragStart: startDrag,
    canEdit,
    dropTarget,
  };

  return (
    <div className="schedule-wrap">
      <div className="section-title">{t("schedule")}</div>
      <div className="section-sub">{t("scheduleSub")}</div>

      {!canEdit && (
        <div className="schedule-readonly-hint">{t("readOnlySchedule")}</div>
      )}

      <ScheduleToolbar
        view={view}
        anchorDate={anchorDate}
        onViewChange={setView}
        onNavigate={navigate}
        onToday={() => setAnchorDate(new Date())}
      />

      {showLegend && <InstructorLegend instructors={instructorLegend} />}

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : (
        <>
          {view === "month" && <MonthView {...viewProps} dropTargetDate={dropTarget} />}
          {view === "week" && <WeekView {...viewProps} />}
          {view === "day" && <DayView {...viewProps} />}
          {lessons.length === 0 && (
            <div className="schedule-empty">{t("noLessons")}</div>
          )}
        </>
      )}

      {panel && (
        <LessonPanel
          mode={panel.mode}
          lesson={panel.lesson}
          profile={profile}
          instructors={instructors}
          showInstructorPicker={showInstructorPicker && panel.mode === "create"}
          initialForm={panel.initial || {}}
          onClose={() => setPanel(null)}
          onSave={handlePanelSave}
          onCancel={handlePanelCancel}
          onCreate={handlePanelCreate}
          acting={acting}
        />
      )}

      {pendingAction && (
        <RecurringScopeDialog
          onChoose={handleScopeChoose}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {ghost}
    </div>
  );
}
