import { supabase } from "./supabase.js";

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** @param {"today"|"week"|"month"} preset */
export function periodPresetRange(preset = "month") {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const asOf = toDateStr(today);

  if (preset === "today") {
    return { from: asOf, to: asOf, asOf };
  }
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toDateStr(start), to: asOf, asOf };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toDateStr(start), to: asOf, asOf };
}

export async function getSchoolOverviewKpis(asOf = null, seasonId = null) {
  const { data, error } = await supabase.rpc("get_school_overview_kpis", {
    p_as_of: asOf || new Date().toISOString().slice(0, 10),
    p_season_id: seasonId,
  });
  if (error) throw error;
  return data || {};
}

export async function getStudentDemographics(seasonId = null) {
  const { data, error } = await supabase.rpc("get_student_demographics", {
    p_season_id: seasonId,
  });
  if (error) throw error;
  return data || {};
}

export async function getRevenueBreakdown(from, to) {
  const { data, error } = await supabase.rpc("get_revenue_breakdown", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data || {};
}

export async function getInstructorAnalytics(from, to, instructorId = null) {
  const { data, error } = await supabase.rpc("get_instructor_analytics", {
    p_from: from,
    p_to: to,
    p_instructor_id: instructorId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAttendanceSummary(from, to, groupBy = "product") {
  const { data, error } = await supabase.rpc("get_attendance_summary", {
    p_from: from,
    p_to: to,
    p_group_by: groupBy,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getMarketingFunnel(from, to) {
  const { data, error } = await supabase.rpc("get_marketing_funnel", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data || {};
}

export async function getOperationsDaily(date = null) {
  const { data, error } = await supabase.rpc("get_operations_daily", {
    p_date: date || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getSchoolHealthScore(month = null) {
  const d = month ? new Date(`${month}T12:00:00`) : new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("get_school_health_score", {
    p_month: monthStart,
  });
  if (error) throw error;
  return data || {};
}

export async function getOccupancyTrend(from, to, seasonId = null) {
  const { data, error } = await supabase.rpc("get_occupancy_trend", {
    p_from: from,
    p_to: to,
    p_season_id: seasonId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function generateOperationalAlerts() {
  const { data, error } = await supabase.rpc("generate_operational_alerts");
  if (error) throw error;
  return data || {};
}
