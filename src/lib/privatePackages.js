import { supabase } from "./supabase.js";

export async function purchasePrivatePackage(familyId, packageCode, participantId = null, amountOverride = null) {
  const { data, error } = await supabase.rpc("purchase_private_package", {
    p_family_id: familyId,
    p_package_code: packageCode,
    p_participant_id: participantId,
    p_amount_override: amountOverride,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function consumePackageSession(packageId) {
  const { data, error } = await supabase.rpc("consume_package_session", {
    p_package_id: packageId,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listActivePackages(familyId) {
  const { data, error } = await supabase
    .from("private_lesson_packages")
    .select("id, package_code, sessions_total, sessions_remaining, amount_paid, purchased_at, active, participant_id")
    .eq("family_id", familyId)
    .eq("active", true)
    .gt("sessions_remaining", 0)
    .order("purchased_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listPackagesForFamily(familyId) {
  const { data, error } = await supabase
    .from("private_lesson_packages")
    .select("id, package_code, sessions_total, sessions_remaining, amount_paid, purchased_at, active")
    .eq("family_id", familyId)
    .order("purchased_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
