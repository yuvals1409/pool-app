import { supabase } from "./supabase.js";
import { getOperationsDaily } from "./commandCenter.js";

export { getOperationsDaily };

export async function listWeeklyCancelledSessions(from, to) {
  const { data, error } = await supabase
    .from("scheduled_sessions")
    .select("id, session_date, start_time, end_time, status, product:products(name, instructor_name)")
    .eq("status", "cancelled")
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listScheduledMakeups(from, to, limit = 30) {
  const { data, error } = await supabase
    .from("makeup_bookings")
    .select(`
      id,
      status,
      notes,
      target_session:scheduled_sessions!makeup_bookings_target_session_id_fkey(
        id, session_date, start_time, end_time,
        product:products(name)
      ),
      enrollment:enrollments(
        participant:participants(full_name)
      )
    `)
    .eq("status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter((row) => {
    const session = Array.isArray(row.target_session) ? row.target_session[0] : row.target_session;
    const d = session?.session_date;
    if (!d) return false;
    return d >= from && d <= to;
  });
}
