import { supabase } from "./supabase.js";

export async function upsertAnnualPackage(participantId, seasonId, weeklySlots) {
  const { data, error } = await supabase.rpc("upsert_annual_package", {
    p_participant_id: participantId,
    p_season_id: seasonId,
    p_weekly_slots: weeklySlots,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getAnnualPackage(participantId, seasonId) {
  const { data, error } = await supabase
    .from("participant_annual_packages")
    .select("id, weekly_slots, active, created_at")
    .eq("participant_id", participantId)
    .eq("season_id", seasonId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function countAnnualEnrollments(participantId, seasonId) {
  const { data, error } = await supabase.rpc("count_annual_enrollments", {
    p_participant_id: participantId,
    p_season_id: seasonId,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function detectPackageMismatch(participantId, seasonId) {
  const [pkg, count] = await Promise.all([
    getAnnualPackage(participantId, seasonId),
    countAnnualEnrollments(participantId, seasonId),
  ]);
  if (!pkg) return null;
  if (pkg.weekly_slots !== count) {
    return { weeklySlots: pkg.weekly_slots, enrolledCount: count };
  }
  return null;
}
