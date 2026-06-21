import { supabase } from "./supabase.js";

export async function getSummerPlanningSummary(seasonId) {
  const { data, error } = await supabase.rpc("get_summer_planning_summary", {
    p_season_id: seasonId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "summary_failed");
  return data;
}

export async function enableSummerPlanning(seasonId) {
  const { data, error } = await supabase.rpc("enable_summer_planning", {
    p_season_id: seasonId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "enable_failed");
  return data;
}

export async function listSummerProducts(seasonId) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, day_of_week, start_time, end_time, instructor_name, capacity, product_templates(code)")
    .eq("season_id", seasonId)
    .order("start_time");
  if (error) throw error;
  return (data || []).filter((p) => p.product_templates?.code === "summer_course");
}
