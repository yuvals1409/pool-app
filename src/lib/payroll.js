import { supabase } from "./supabase.js";

export const PAYROLL_TEMPLATE_CODES = [
  "private_lesson",
  "annual_section",
  "summer_course",
  "swim_assessment",
];

export async function getInstructorWorkSessions(from, to, instructorId = null) {
  const { data, error } = await supabase.rpc("get_instructor_work_sessions", {
    p_from: from,
    p_to: to,
    p_instructor_id: instructorId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getInstructorPayrollSummary(from, to, instructorId = null) {
  const { data, error } = await supabase.rpc("get_instructor_payroll_summary", {
    p_from: from,
    p_to: to,
    p_instructor_id: instructorId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listInstructorPayRates(instructorId) {
  const { data, error } = await supabase.rpc("list_instructor_pay_rates", {
    p_instructor_id: instructorId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertInstructorPayRate(instructorId, templateCode, ratePerHour) {
  const { data, error } = await supabase.rpc("upsert_instructor_pay_rate", {
    p_instructor_id: instructorId,
    p_template_code: templateCode,
    p_rate_per_hour: ratePerHour,
  });
  if (error) throw error;
  return data;
}

export function monthBounds(year, month) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function currentMonthBounds() {
  const now = new Date();
  return monthBounds(now.getFullYear(), now.getMonth() + 1);
}
