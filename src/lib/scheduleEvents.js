import { supabase, ensureWeeklyLessonsGenerated } from "./supabase.js";
import { getViewDateRange, toLocalDateStr, timeToMinutes } from "./lessonDates.js";
import { LESSON_DURATION_MINUTES } from "./config.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizePrivateLesson(lesson) {
  return {
    ...lesson,
    schedule_kind: "private",
    template_code: "private_lesson",
    display_title: lesson.child_name,
  };
}

export function normalizeGroupSession(session) {
  const product = session.products;
  const code = product?.product_templates?.code || "annual_section";
  return {
    id: `group-${session.id}`,
    schedule_kind: "group",
    session_id: session.id,
    scheduled_session_id: session.id,
    template_code: code,
    child_name: product?.name || "",
    display_title: product?.name || "",
    lesson_date: session.session_date,
    start_time: session.start_time,
    end_time: session.end_time,
    instructor_id: product?.instructor_id,
    instructor_name: product?.instructor_name,
    cancelled: session.status === "cancelled",
    used: false,
  };
}

export function normalizeAssessmentSlot(slot) {
  const time = String(slot.start_time).slice(0, 5);
  return {
    id: `assessment-${slot.id}`,
    schedule_kind: "group",
    session_id: slot.session_id || slot.id,
    scheduled_session_id: slot.session_id,
    assessment_slot_id: slot.id,
    template_code: "swim_assessment",
    child_name: `מבדק ${time}`,
    display_title: `מבדק ${time} (${slot.enrolled_count || 0})`,
    lesson_date: slot.slot_date,
    start_time: slot.start_time,
    end_time: (slot.start_time && slot.start_time.length >= 5)
      ? null
      : null,
    instructor_id: null,
    instructor_name: "מבדק",
    cancelled: !slot.active,
    used: false,
    enrolled_count: slot.enrolled_count,
  };
}

export function eventDurationMinutes(event) {
  if (event.template_code === "swim_assessment") return 30;
  if (event.end_time && event.start_time) {
    const mins = timeToMinutes(event.end_time) - timeToMinutes(event.start_time);
    if (mins > 0) return mins;
  }
  return LESSON_DURATION_MINUTES;
}

function filterGroupSessionForInstructor(session, profileId) {
  const code = session.products?.product_templates?.code;
  if (code === "swim_assessment") return false;
  return session.products?.instructor_id === profileId;
}

function filterAssessmentSlotForInstructor(slot) {
  return slot.slot_date === todayStr();
}

export async function loadScheduleEvents({
  profile,
  view,
  anchorDate,
  canViewAllInstructors,
}) {
  await ensureWeeklyLessonsGenerated();
  const { start, end } = getViewDateRange(view, anchorDate);
  const from = toLocalDateStr(start);
  const to = toLocalDateStr(end);

  let lessonsQuery = supabase
    .from("lessons")
    .select("*")
    .gte("lesson_date", from)
    .lte("lesson_date", to)
    .eq("cancelled", false)
    .order("lesson_date")
    .order("start_time");

  if (!canViewAllInstructors) {
    lessonsQuery = lessonsQuery.eq("instructor_id", profile.id);
  }

  const sessionsQuery = supabase
    .from("scheduled_sessions")
    .select(`
      id, session_date, start_time, end_time, status,
      products (
        name, instructor_id, instructor_name,
        product_templates (code)
      )
    `)
    .gte("session_date", from)
    .lte("session_date", to)
    .neq("status", "cancelled")
    .order("session_date")
    .order("start_time");

  const slotsQuery = supabase
    .from("assessment_slots")
    .select("id, slot_date, start_time, capacity, enrolled_count, active, session_id")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .eq("active", true)
    .order("slot_date")
    .order("start_time");

  const [
    { data: lessons, error: lessonsErr },
    { data: sessions, error: sessionsErr },
    { data: slots, error: slotsErr },
  ] = await Promise.all([lessonsQuery, sessionsQuery, slotsQuery]);

  if (lessonsErr) throw lessonsErr;
  if (sessionsErr) throw sessionsErr;
  if (slotsErr) throw slotsErr;

  const privateEvents = (lessons || []).map(normalizePrivateLesson);

  const groupEvents = (sessions || [])
    .filter((s) => s.products?.product_templates?.code !== "swim_assessment")
    .filter((s) => s.products && (
      canViewAllInstructors || filterGroupSessionForInstructor(s, profile.id)
    ))
    .map(normalizeGroupSession);

  const assessmentEvents = (slots || [])
    .filter((slot) => canViewAllInstructors || filterAssessmentSlotForInstructor(slot))
    .map(normalizeAssessmentSlot);

  return [...privateEvents, ...groupEvents, ...assessmentEvents].sort((a, b) => {
    const byDate = a.lesson_date.localeCompare(b.lesson_date);
    if (byDate !== 0) return byDate;
    return a.start_time.localeCompare(b.start_time);
  });
}

export function isGroupScheduleEvent(event) {
  return event?.schedule_kind === "group";
}

export function buildAttendanceFocusFromEvent(event) {
  if (!event) return null;
  if (event.schedule_kind === "private") {
    return { date: event.lesson_date, lessonId: event.id };
  }
  return {
    date: event.lesson_date,
    scheduledSessionId: event.scheduled_session_id || event.session_id,
    sessionId: event.session_id,
  };
}
