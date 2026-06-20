import { supabase } from "./supabase.js";
import { getActivePriceList, getPriceFromList } from "./priceList.js";

export async function resolveEffectiveTier(participantId, productCode) {
  const { data, error } = await supabase.rpc("resolve_effective_tier", {
    p_participant_id: participantId,
    p_product_code: productCode,
  });
  if (error) throw error;
  return data || "external";
}

export async function getPriceListAmount(productCode, tier, asOf = null) {
  const { data, error } = await supabase.rpc("get_price_list_amount", {
    p_product_code: productCode,
    p_tier: tier,
    p_as_of: asOf || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data != null ? Number(data) : null;
}

export function applySiblingDiscount(amount, discountPct) {
  const base = Number(amount);
  const pct = Number(discountPct) || 0;
  if (!Number.isFinite(base)) return 0;
  return Math.round(base * (1 - pct / 100) * 100) / 100;
}

export async function getPriceForParticipant(participantId, productCode, asOf = null) {
  const tier = await resolveEffectiveTier(participantId, productCode);
  const amount = await getPriceListAmount(productCode, tier, asOf);
  return { tier, amount };
}

export async function getLandingCoursePrices(asOf = null) {
  const list = await getActivePriceList(asOf);
  return {
    external: getPriceFromList(list, "swim_course_12", "external") ?? 1600,
    subscriber: getPriceFromList(list, "swim_course_12", "subscriber") ?? 1400,
    shareholder: getPriceFromList(list, "swim_course_12", "shareholder") ?? 1250,
  };
}

export async function suggestPrivateLessonPrice(participantId, lessonFormat = "single", asOf = null) {
  const { data, error } = await supabase.rpc("suggest_private_lesson_price", {
    p_participant_id: participantId,
    p_lesson_format: lessonFormat,
    p_as_of: asOf || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data;
}
