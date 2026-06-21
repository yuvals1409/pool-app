import { supabase } from "./supabase.js";

export const CONTINUATION_INTENTS = ["confirmed", "refused", "undecided"];

export async function listSourceAnnualProducts(sourceSeasonId) {
  const { data, error } = await supabase.rpc("list_source_annual_products", {
    p_source_season_id: sourceSeasonId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "list_failed");
  return data.products || [];
}

export async function cloneSeasonProductsSelective(sourceSeasonId, targetSeasonId, productIds) {
  if (!productIds?.length) throw new Error("no_products_selected");
  const { data, error } = await supabase.rpc("clone_season_products", {
    p_source_season_id: sourceSeasonId,
    p_target_season_id: targetSeasonId,
    p_product_ids: productIds,
  });
  if (error) throw error;
  if (data?.result === "no_products_selected") throw new Error("no_products_selected");
  if (data?.result !== "ok") throw new Error(data?.result || "clone_failed");
  return data;
}

export async function carryForwardIntents(sourceSeasonId, targetSeasonId, dryRun = false) {
  const { data, error } = await supabase.rpc("carry_forward_intents", {
    p_source_season_id: sourceSeasonId || null,
    p_target_season_id: targetSeasonId,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "carry_forward_failed");
  return data;
}

export async function getAnnualPlanningSummary(targetSeasonId, sourceSeasonId = null) {
  const { data, error } = await supabase.rpc("get_annual_planning_summary", {
    p_target_season_id: targetSeasonId,
    p_source_season_id: sourceSeasonId || null,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "summary_failed");
  return data;
}

export async function setParticipantIntent({
  seasonId,
  participantId,
  intent,
  targetProductId = null,
  sourceProductId = null,
}) {
  const { data, error } = await supabase.rpc("set_participant_intent", {
    p_season_id: seasonId,
    p_participant_id: participantId,
    p_intent: intent,
    p_target_product_id: targetProductId,
    p_source_product_id: sourceProductId,
  });
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "intent_failed");
  return data;
}

export async function listAnnualProducts(seasonId) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, day_of_week, start_time, end_time, instructor_name, product_templates(code)")
    .eq("season_id", seasonId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return (data || []).filter((p) => p.product_templates?.code === "annual_section");
}
