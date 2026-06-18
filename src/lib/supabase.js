import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: "pool-app-auth",
  },
});

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function weekBoundsSunday(d) {
  const sunday = new Date(d);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday, end: saturday };
}

/** Current week + next week (ברקודים נוצרים בחמישי לשבוע הבא) */
export function getPassGenerationRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeek = weekBoundsSunday(today);
  const nextSunday = new Date(thisWeek.start);
  nextSunday.setDate(nextSunday.getDate() + 7);
  const nextWeek = weekBoundsSunday(nextSunday);
  return { from: thisWeek.start, to: nextWeek.end };
}

export async function ensureWeeklyLessonsGenerated() {
  const { from, to } = getPassGenerationRange();
  const nextSunday = new Date(from);
  nextSunday.setDate(nextSunday.getDate() + 7);
  await supabase.rpc("generate_weekly_recurring_lessons", { p_target_week_start: fmt(from) });
  await supabase.rpc("generate_weekly_recurring_lessons", { p_target_week_start: fmt(nextSunday) });
}

export async function ensureWeeklySessionsGenerated() {
  const { from, to } = getPassGenerationRange();
  await supabase.rpc("generate_weekly_sessions", { p_from: fmt(from), p_to: fmt(to) });
}

export async function ensureAccessPassesGenerated() {
  const { from, to } = getPassGenerationRange();
  await supabase.rpc("generate_access_passes", { p_from: fmt(from), p_to: fmt(to) });
}

export async function markLessonNotified(lessonId) {
  await supabase.from("lessons")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", lessonId);
}

export async function ensureCourseSeriesSessions(productId) {
  const { error } = await supabase.rpc("generate_course_series_sessions", {
    p_product_id: productId,
  });
  if (error) throw error;
}
