import { supabase } from "./supabase.js";

const DAY_NUM_TO_NAME = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};

export function productKeyFromRow(product) {
  if (!product) return "";
  const day = DAY_NUM_TO_NAME[product.day_of_week] ?? String(product.day_of_week ?? "");
  const start = String(product.start_time || "").slice(0, 8);
  const end = String(product.end_time || "").slice(0, 8);
  return `${day}|${product.instructor_name || ""}|${start}|${end}|${product.name || ""}`;
}

export function seasonLifecycle(season, today = new Date()) {
  if (!season) return "unknown";
  const todayStr = today.toISOString().slice(0, 10);
  if (season.active) return "active";
  if (season.end_date && season.end_date < todayStr) return "ended";
  if (season.start_date && season.start_date > todayStr) return "planning";
  return "planning";
}

export function suggestNextSeasonDates(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const startYear = m >= 9 ? y + 1 : y;
  const endYear = startYear + 1;
  return {
    name: `${startYear}/${String(endYear).slice(-2)}`,
    start_date: `${startYear}-09-01`,
    end_date: `${endYear}-06-30`,
    kind: "annual",
  };
}

const SEASON_FIELDS = "id, name, start_date, end_date, active, kind, summer_planning_enabled";

export async function listSeasons() {
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_FIELDS)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getActiveSeason() {
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_FIELDS)
    .eq("active", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlanningSeason() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_FIELDS)
    .eq("active", false)
    .gt("start_date", today)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function suggestNextSeason() {
  const { data, error } = await supabase.rpc("suggest_next_season");
  if (error) throw error;
  if (data?.result !== "ok") throw new Error(data?.result || "suggest_failed");
  return data;
}

export async function createPlanningSeason({ name, startDate, endDate, kind } = {}) {
  const { data, error } = await supabase.rpc("create_planning_season", {
    p_name: name || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_kind: kind || "annual",
  });
  if (error) throw error;
  if (data?.result === "duplicate_name") {
    throw new Error("duplicate_season_name");
  }
  if (data?.result !== "ok") throw new Error(data?.result || "create_failed");
  return data;
}

export {
  cloneSeasonProductsSelective as cloneSeasonProducts,
  carryForwardIntents as carryForwardEnrollments,
  getAnnualPlanningSummary as getSeasonPlanningSummary,
  listSourceAnnualProducts,
  setParticipantIntent,
  listAnnualProducts,
  CONTINUATION_INTENTS,
} from "./seasonPlanningAnnual.js";

export {
  getSummerPlanningSummary,
  enableSummerPlanning,
  listSummerProducts,
} from "./seasonPlanningSummer.js";

export {
  getSeasonMasterSchedule,
  upsertScheduleSlot,
  assignSlotProduct,
  deleteScheduleSlot,
  slotToEvent,
  buildDayLayout,
  layoutStyleForEvent,
  PLANNING_DAYS,
  SCHEDULE_LAYERS,
} from "./seasonMasterSchedule.js";

export async function activateSeason(seasonId) {
  const { data, error } = await supabase.rpc("activate_season", {
    p_season_id: seasonId,
  });
  if (error) throw error;
  if (data?.result === "already_active") return data;
  if (data?.result !== "ok") throw new Error(data?.result || "activate_failed");
  return data;
}
