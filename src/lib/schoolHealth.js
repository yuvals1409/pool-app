import { supabase } from "./supabase.js";
import { getSchoolHealthScore } from "./commandCenter.js";

export async function getHealthSettings() {
  const { data, error } = await supabase
    .from("school_health_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function validateHealthSettings({ occupancy_weight, growth_ratio_weight, green_min, yellow_min }) {
  const occ = Number(occupancy_weight);
  const growth = Number(growth_ratio_weight);
  const green = Number(green_min);
  const yellow = Number(yellow_min);
  if (!Number.isFinite(occ) || !Number.isFinite(growth) || !Number.isFinite(green) || !Number.isFinite(yellow)) {
    return "invalid";
  }
  if (occ + growth !== 100) return "weights";
  if (green <= yellow) return "thresholds";
  if ([occ, growth, green, yellow].some((v) => v < 0 || v > 100)) return "range";
  return null;
}

export async function updateHealthSettings(settingsId, values) {
  const err = validateHealthSettings(values);
  if (err) {
    const e = new Error(err);
    e.code = err;
    throw e;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("school_health_settings")
    .update({
      occupancy_weight: Number(values.occupancy_weight),
      growth_ratio_weight: Number(values.growth_ratio_weight),
      green_min: Number(values.green_min),
      yellow_min: Number(values.yellow_min),
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    })
    .eq("id", settingsId);
  if (error) throw error;
}

function monthStartStr(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toISOString().slice(0, 10);
}

export async function loadHealthHistory(months = 12) {
  const today = new Date();
  const tasks = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStart = monthStartStr(d.getFullYear(), d.getMonth());
    tasks.push(
      getSchoolHealthScore(monthStart).then((row) => ({
        month: monthStart,
        label: monthStart.slice(0, 7),
        score: row.score ?? 0,
        occupancy_pct: row.occupancy_pct ?? 0,
        color: row.color,
      })),
    );
  }
  const results = await Promise.all(tasks);
  return results;
}

export async function getHealthScoreForMonth(monthValue) {
  const monthStart = `${monthValue}-01`;
  return getSchoolHealthScore(monthStart);
}

export function prevMonthValue(monthValue) {
  const [y, m] = monthValue.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
