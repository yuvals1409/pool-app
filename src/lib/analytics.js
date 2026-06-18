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

export async function getAttendanceByInstructor(from, to, productId = null) {
  const { data, error } = await supabase.rpc("get_attendance_by_instructor", {
    p_from: from,
    p_to: to,
    p_product_id: productId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getScanVsAttendance(from, to, productId = null) {
  const { data, error } = await supabase.rpc("get_scan_vs_attendance", {
    p_from: from,
    p_to: to,
    p_product_id: productId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getRevenueBySeason(seasonId = null) {
  const { data, error } = await supabase.rpc("get_revenue_by_season", {
    p_season_id: seasonId,
  });
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

export async function getAssessmentConversionFunnel(from, to) {
  const { data, error } = await supabase.rpc("get_assessment_conversion_funnel", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data || {};
}

export function exportCsv(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
