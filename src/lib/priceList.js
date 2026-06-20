import { supabase } from "./supabase.js";

export const PRODUCT_CODES = [
  "swim_course_12",
  "annual_monthly_1x",
  "annual_monthly_2x",
  "private_single",
  "private_5pack",
  "private_double",
  "private_10pack",
  "adult_style_improvement",
];

export const PRODUCT_CATEGORIES = {
  course: ["swim_course_12"],
  annual: ["annual_monthly_1x", "annual_monthly_2x"],
  private: ["private_single", "private_5pack", "private_double", "private_10pack"],
  other: ["adult_style_improvement"],
};

export const TIERS = ["external", "subscriber", "shareholder"];

export async function getActivePriceList(asOf = null) {
  const { data, error } = await supabase.rpc("get_active_price_list", {
    p_as_of: asOf || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data || { version: null, items: [] };
}

export async function listPriceListVersions() {
  const { data, error } = await supabase.rpc("list_price_list_versions");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createPriceListVersion(effectiveFrom, label) {
  const { data, error } = await supabase.rpc("create_price_list_version", {
    p_effective_from: effectiveFrom,
    p_label: label,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function updatePriceListItem(versionId, productCode, tier, amount) {
  const { data, error } = await supabase.rpc("update_price_list_item", {
    p_version_id: versionId,
    p_product_code: productCode,
    p_tier: tier,
    p_amount: Number(amount),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Build { productCode: { external, subscriber, shareholder } } from flat items list */
export function itemsToMatrix(items = []) {
  const matrix = {};
  for (const code of PRODUCT_CODES) {
    matrix[code] = { external: null, subscriber: null, shareholder: null };
  }
  for (const row of items) {
    if (matrix[row.product_code]) {
      matrix[row.product_code][row.tier] = Number(row.amount);
    }
  }
  return matrix;
}

export function getPriceFromList(priceList, productCode, tier) {
  const items = priceList?.items || [];
  const effectiveTier = productCode === "swim_course_12" ? tier : (tier === "shareholder" ? "subscriber" : tier);
  const row = items.find((i) => i.product_code === productCode && i.tier === effectiveTier);
  return row != null ? Number(row.amount) : null;
}
