import { supabase, ensureWeeklyLessonsGenerated } from "./supabase.js";
import { getViewDateRange, toLocalDateStr, timeToMinutes } from "./lessonDates.js";
import { LESSON_DURATION_MINUTES } from "./config.js";

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

export function eventDurationMinutes(event) {
  if (event.end_time && event.start_time) {
    const mins = timeToMinutes(event.end_time) - timeToMinutes(event.start_time);
    if (mins > 0) return mins;
  }
  return LESSON_DURATION_MINUTES;
}

function filterGroupSessionForInstructor(session, profileId) {
  const code = session.products?.product_templates?.code;
  if (code === "swim_assessment") return true;
  return session.products?.instructor_id === profileId;
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

  const [{ data: lessons, error: lessonsErr }, { data: sessions, error: sessionsErr }] =
    await Promise.all([lessonsQuery, sessionsQuery]);

  if (lessonsErr) throw lessonsErr;
  if (sessionsErr) throw sessionsErr;

  const privateEvents = (lessons || []).map(normalizePrivateLesson);

  const groupEvents = (sessions || [])
    .filter((s) => s.products && (
      canViewAllInstructors || filterGroupSessionForInstructor(s, profile.id)
    ))
    .map(normalizeGroupSession);

  return [...privateEvents, ...groupEvents].sort((a, b) => {
    const byDate = a.lesson_date.localeCompare(b.lesson_date);
    if (byDate !== 0) return byDate;
    return a.start_time.localeCompare(b.start_time);
  });
}

export function isGroupScheduleEvent(event) {
  return event?.schedule_kind === "group";
}
