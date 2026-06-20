import { supabase } from "./supabase.js";

export async function getSiblingDiscountPct(participantId, enrollmentId = null) {
  const { data, error } = await supabase.rpc("sibling_discount_eligible", {
    p_participant_id: participantId,
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  return Number(data) || 0;
}
