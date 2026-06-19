import { supabase } from "./supabase.js";

export async function listMakeupTargetSessions(enrollmentId, fromDate, toDate = null) {
  const { data, error } = await supabase.rpc("list_makeup_target_sessions", {
    p_enrollment_id: enrollmentId,
    p_from: fromDate,
    p_to: toDate,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function bookMakeupSession(enrollmentId, targetSessionId, {
  sourceSessionAttendeeId = null,
  notes = null,
} = {}) {
  const { data, error } = await supabase.rpc("book_makeup_session", {
    p_enrollment_id: enrollmentId,
    p_target_session_id: targetSessionId,
    p_source_session_attendee_id: sourceSessionAttendeeId,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

export async function cancelMakeupSession(makeupBookingId) {
  const { data, error } = await supabase.rpc("cancel_makeup_session", {
    p_makeup_booking_id: makeupBookingId,
  });
  if (error) throw error;
  return data;
}
