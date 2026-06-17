import { supabase } from "./supabase.js";

export async function listInstructorSessions(date) {
  const { data, error } = await supabase.rpc("list_instructor_sessions", {
    p_date: date,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getSessionAttendanceRoster(sessionId) {
  const { data, error } = await supabase.rpc("get_session_attendance_roster", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getLessonAttendance(lessonId) {
  const { data, error } = await supabase.rpc("get_lesson_attendance", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
  return data;
}

export async function submitSessionAttendance(sessionId, marks) {
  const { data, error } = await supabase.rpc("submit_session_attendance", {
    p_session_id: sessionId,
    p_marks: marks,
  });
  if (error) throw error;
  return data;
}

export async function submitLessonAttendance(lessonId, status, notes = null) {
  const { data, error } = await supabase.rpc("submit_lesson_attendance", {
    p_lesson_id: lessonId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

export async function listAttendanceHistory({ from, to, productId = null, participantId = null }) {
  const { data, error } = await supabase.rpc("list_attendance_history", {
    p_from: from,
    p_to: to,
    p_product_id: productId,
    p_participant_id: participantId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function markLessonScanAttendance(lessonId) {
  const { error } = await supabase.rpc("mark_lesson_scan_attendance", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
}

export function templateLabel(t, code) {
  const map = {
    annual_section: t("productTypeAnnual"),
    summer_course: t("productTypeSummer"),
    swim_assessment: t("tabAssessment"),
    private_lesson: t("lessonOnce"),
  };
  return map[code] || code;
}
