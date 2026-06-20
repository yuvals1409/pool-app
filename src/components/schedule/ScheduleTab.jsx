import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { AnimatePresence } from "framer-motion";
import { Calendar } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { supabase } from "../../lib/supabase.js";
import {
  canEditSchedule, canManage, canViewAllInstructors, canMarkAttendance,
} from "../../lib/permissions.js";
import { parseDateStr } from "../../lib/lessonDates.js";
import { buildInstructorMap } from "../../lib/instructorColors.js";
import {
  updateLesson, cancelLesson, createAndNotify, RECURRING_SCOPE,
} from "../../lib/lessonMutations.js";
import {
  loadScheduleEvents, isGroupScheduleEvent, buildAttendanceFocusFromEvent,
} from "../../lib/scheduleEvents.js";
import ScheduleToolbar from "./ScheduleToolbar.jsx";
import MonthView from "./MonthView.jsx";
import WeekView from "./WeekView.jsx";
import DayView from "./DayView.jsx";
import LessonPanel from "./LessonPanel.jsx";
import SessionSchedulePanel from "./SessionSchedulePanel.jsx";
import RecurringScopeDialog from "./RecurringScopeDialog.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import { Spinner, EmptyState } from "../ui/ds/index.js";
import "./schedule.css";

const ScheduleTab = forwardRef(function ScheduleTab({ profile, toast, onMarkAttendance }, ref) {
  const i18n = useLang();
  const { t } = i18n;
  const isDesktop = useIsDesktop();
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
  const [sessionPanel, setSessionPanel] = useState(null);
  const showMarkAttendance = canMarkAttendance(profile);

  const handleMarkAttendance = (event) => {
    const focus = buildAttendanceFocusFromEvent(event);
    if (focus && onMarkAttendance) {
      setSessionPanel(null);
      onMarkAttendance(focus);
    }
  };
  const [pendingAction, setPendingAction] = useState(null);

  useImperativeHandle(ref, () => ({
    goToday: () => setAnchorDate(new Date()),
    openCreateLesson: () => {
      if (!canEdit) return;
      setPanel({ mode: "create", initial: {} });
    },
  }), [canEdit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const events = await loadScheduleEvents({
        profile,
        view,
        anchorDate,
        canViewAllInstructors: showLegend,
      });
      setLessons(events);
    } catch {
      toast.show(t("systemError"));
      setLessons([]);
    }
    setLoading(false);
  }, [view, anchorDate, profile, showLegend, toast, t]);

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

    if (action.type === "edit" && scope === RECURRING_SCOPE.SINGLE) {
      const newDate = action.form?.lesson_date ?? lesson.lesson_date;
      if (newDate !== lesson.lesson_date) {
        toast.show(t("recurringSingleDateError"));
        return;
      }
    }

    if (!confirm(t("editConfirm", { name: lesson.child_name }))) return;
    performUpdate(lesson, action.form, scope);
  };

  const onLessonClick = (lesson) => {
    if (isGroupScheduleEvent(lesson)) {
      setSessionPanel(lesson);
      return;
    }
    setPanel({ mode: "view", lesson });
  };

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
    canEdit,
  };

  const panelLayout = isDesktop ? "inline" : "sheet";
  const hasRailPanel = isDesktop && (panel || sessionPanel);
  const wrapClass = `schedule-wrap${hasRailPanel ? " schedule-wrap--with-rail" : ""}${isDesktop ? " schedule-wrap--desktop" : ""}`;

  return (
    <div className={wrapClass}>
      {!isDesktop && (
        <>
          <div className="section-title">{t("schedule")}</div>
          <div className="section-sub">{t("scheduleSub")}</div>
        </>
      )}

      {!canEdit && (
        <div className="schedule-readonly-hint">{t("readOnlySchedule")}</div>
      )}

      <div className="schedule-body">
        <div className="schedule-main">
          <ScheduleToolbar
            view={view}
            anchorDate={anchorDate}
            instructors={instructorLegend}
            showLegend={showLegend}
            hideToday={isDesktop}
            onViewChange={setView}
            onNavigate={navigate}
            onToday={() => setAnchorDate(new Date())}
          />

          {loading ? (
            <div className="schedule-loading">
              <Spinner size={28} />
              <span>{t("loading")}</span>
            </div>
          ) : (
            <>
              {view === "month" && <MonthView {...viewProps} />}
              {view === "week" && <WeekView {...viewProps} />}
              {view === "day" && <DayView {...viewProps} />}
              {lessons.length === 0 && (
                <EmptyState
                  icon={<Calendar size={22} aria-hidden />}
                  title={t("noScheduleEvents")}
                />
              )}
            </>
          )}
        </div>

        {hasRailPanel && (
          <div className="schedule-rail">
            {sessionPanel && (
              <SessionSchedulePanel
                key={sessionPanel.id}
                event={sessionPanel}
                profile={profile}
                instructors={instructors}
                toast={toast}
                onSubstituteChange={() => { setSessionPanel(null); load(); }}
                onClose={() => setSessionPanel(null)}
                layout={panelLayout}
                showMarkAttendance={showMarkAttendance}
                onMarkAttendance={handleMarkAttendance}
              />
            )}
            {panel && (
              <LessonPanel
                key={panel.lesson?.id || panel.mode}
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
                toast={toast}
                layout={panelLayout}
              />
            )}
          </div>
        )}
      </div>

      {!isDesktop && (
        <>
          <AnimatePresence>
            {sessionPanel && (
              <SessionSchedulePanel
                key={sessionPanel.id}
                event={sessionPanel}
                profile={profile}
                instructors={instructors}
                toast={toast}
                onSubstituteChange={() => { setSessionPanel(null); load(); }}
                onClose={() => setSessionPanel(null)}
                layout={panelLayout}
                showMarkAttendance={showMarkAttendance}
                onMarkAttendance={handleMarkAttendance}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {panel && (
              <LessonPanel
                key={panel.lesson?.id || panel.mode}
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
                toast={toast}
                layout={panelLayout}
              />
            )}
          </AnimatePresence>
        </>
      )}

      {pendingAction && (
        <RecurringScopeDialog
          onChoose={handleScopeChoose}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
});

export default ScheduleTab;
