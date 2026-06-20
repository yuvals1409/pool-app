import { supabase } from "./supabase.js";

export function parseAssessmentRegisterPath() {
  if (window.location.pathname.match(/\/register\/assessment\/?$/i)) {
    return true;
  }
  if (window.location.pathname.match(/\/assessment\/?$/i)) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("register") === "assessment" || !!params.get("offer");
}

export async function listAssessmentSlots() {
  const { data, error } = await supabase.rpc("list_assessment_slots");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function registerForAssessment({
  slotId,
  childName,
  childAge,
  parentName,
  phone,
  source,
  gender,
  grade,
  birthDate,
}) {
  const { data, error } = await supabase.rpc("register_assessment", {
    p_slot_id: slotId,
    p_child_name: childName,
    p_child_age: childAge ?? null,
    p_parent_name: parentName ?? null,
    p_phone: phone,
    p_source: source ?? "website",
    p_gender: gender ?? null,
    p_grade: grade ?? null,
    p_birth_date: birthDate ?? null,
  });
  if (error) throw error;
  return data;
}

export async function syncAssessmentSlotSession(slotId) {
  const { data, error } = await supabase.rpc("sync_assessment_slot_session", {
    p_slot_id: slotId,
  });
  if (error) throw error;
  return data;
}
