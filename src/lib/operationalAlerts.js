import { supabase } from "./supabase.js";
import { generateOperationalAlerts } from "./commandCenter.js";

export async function listOpenAlerts(limit = 50) {
  const { data, error } = await supabase
    .from("operational_alerts")
    .select("*")
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function acknowledgeAlert(alertId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("operational_alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id || null,
    })
    .eq("id", alertId);
  if (error) throw error;
}

export async function refreshOperationalAlerts() {
  return generateOperationalAlerts();
}
