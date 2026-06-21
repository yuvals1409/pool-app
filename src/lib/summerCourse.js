import { supabase } from "./supabase.js";

export function getSummerInviteUrl(token) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  return `${base}/register/summer?invite=${token}`;
}

export function parseSummerRegisterPath() {
  if (window.location.pathname.match(/\/register\/summer\/?$/i)) {
    return true;
  }
  if (window.location.pathname.match(/\/summer\/?$/i)) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("register") === "summer" || !!params.get("invite") || !!params.get("offer");
}

export function getSummerInviteToken() {
  return new URLSearchParams(window.location.search).get("invite");
}

export async function listTodayAssessmentLeads() {
  const { data, error } = await supabase.rpc("list_today_assessment_leads");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function setAssessmentResult(leadId, result) {
  const { data, error } = await supabase.rpc("set_assessment_result", {
    p_lead_id: leadId,
    p_result: result,
  });
  if (error) throw error;
  return data;
}

export async function getSummerInvite(token) {
  const { data, error } = await supabase.rpc("get_summer_invite", { p_token: token });
  if (error) throw error;
  return data;
}

export async function registerSummerCourse(token, productId) {
  const { data, error } = await supabase.rpc("register_summer_course", {
    p_token: token,
    p_product_id: productId,
  });
  if (error) throw error;
  return data;
}

export async function generateCourseSeriesSessions(productId) {
  const { data, error } = await supabase.rpc("generate_course_series_sessions", {
    p_product_id: productId,
  });
  if (error) throw error;
  return data;
}

export async function regenerateEnrollmentPasses(enrollmentId) {
  const { data, error } = await supabase.rpc("regenerate_enrollment_passes", {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  return data;
}
