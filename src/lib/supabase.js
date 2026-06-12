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

export async function ensureWeeklyLessonsGenerated() {
  await supabase.rpc("generate_weekly_recurring_lessons");
}

export async function markLessonNotified(lessonId) {
  await supabase.from("lessons")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", lessonId);
}
