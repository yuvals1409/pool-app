import { supabase } from "./supabase.js";

export async function getDashboardSummary(from, to) {
  const { data, error } = await supabase.rpc("get_dashboard_summary", { p_from: from, p_to: to });
  if (error) throw error;
  return data || {};
}

export async function getAttendanceByWeek(from, to, productId = null) {
  const { data, error } = await supabase.rpc("get_attendance_by_week", {
    p_from: from,
    p_to: to,
    p_product_id: productId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAttendanceByProduct(from, to) {
  const { data, error } = await supabase.rpc("get_attendance_by_product", { p_from: from, p_to: to });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getEnrollmentStats() {
  const { data, error } = await supabase.rpc("get_enrollment_stats");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAssessmentFunnel(from, to) {
  const { data, error } = await supabase.rpc("get_assessment_funnel", { p_from: from, p_to: to });
  if (error) throw error;
  return data || {};
}
