import { supabase } from "./supabase.js";

export async function fetchActiveEnrollmentCounts(productIds) {
  if (!productIds?.length) return {};
  const { data, error } = await supabase
    .from("enrollments")
    .select("product_id")
    .eq("active", true)
    .in("product_id", productIds);
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    map[row.product_id] = (map[row.product_id] || 0) + 1;
  }
  return map;
}
