import { supabase } from "./supabase.js";

export async function getEnrollmentUtilization(enrollmentId, asOf) {
  const { data, error } = await supabase.rpc("get_enrollment_utilization", {
    p_enrollment_id: enrollmentId,
    p_as_of: asOf,
  });
  if (error) throw error;
  return data;
}

export async function listUtilizationReport({
  asOf,
  seasonId = null,
  productId = null,
  templateCode = null,
  minShortfall = 0,
}) {
  const { data, error } = await supabase.rpc("list_utilization_report", {
    p_as_of: asOf,
    p_season_id: seasonId,
    p_product_id: productId,
    p_template_code: templateCode,
    p_min_shortfall: minShortfall,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
