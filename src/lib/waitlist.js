import { supabase } from "./supabase.js";

export function getWaitlistOfferUrl(offerToken, type = "assessment") {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  if (type === "summer") {
    return `${base}/register/summer?offer=${offerToken}`;
  }
  return `${base}/register/assessment?offer=${offerToken}`;
}

export function getWaitlistOfferToken() {
  return new URLSearchParams(window.location.search).get("offer");
}

export async function joinWaitlist({
  targetType,
  targetId,
  childName,
  phone,
  parentName,
  childAge,
  summerInviteToken,
}) {
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_child_name: childName,
    p_phone: phone,
    p_parent_name: parentName ?? null,
    p_child_age: childAge ?? null,
    p_summer_invite_token: summerInviteToken ?? null,
  });
  if (error) throw error;
  return data;
}

export async function getWaitlistOffer(token) {
  const { data, error } = await supabase.rpc("get_waitlist_offer", { p_token: token });
  if (error) throw error;
  return data;
}

export async function registerFromWaitlistOffer(token) {
  const { data, error } = await supabase.rpc("register_from_waitlist_offer", { p_token: token });
  if (error) throw error;
  return data;
}

export async function listWaitlist(targetType = null, targetId = null) {
  const { data, error } = await supabase.rpc("list_waitlist", {
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPendingWaitlistNotifications() {
  const { data, error } = await supabase.rpc("list_pending_waitlist_notifications");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function markWaitlistNotified(entryId) {
  const { data, error } = await supabase.rpc("mark_waitlist_notified", { p_entry_id: entryId });
  if (error) throw error;
  return data;
}

export async function cancelEnrollment(enrollmentId) {
  const { data, error } = await supabase.rpc("cancel_enrollment", { p_enrollment_id: enrollmentId });
  if (error) throw error;
  return data;
}
