import { supabase } from "./supabase.js";

export async function setSessionInstructorOverride(sessionId, substituteId, reason = null) {
  const { data, error } = await supabase.rpc("set_session_instructor_override", {
    p_session_id: sessionId,
    p_substitute_id: substituteId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function clearSessionInstructorOverride(sessionId) {
  return setSessionInstructorOverride(sessionId, null, null);
}
