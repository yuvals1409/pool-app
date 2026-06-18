import { supabase } from "./supabase.js";

const MONTHLY_TABS = ["מאי", "יוני", "יולי"];

export async function triggerSheetSync(direction = "both", tabs = MONTHLY_TABS) {
  const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
    body: { direction, tabs },
  });
  if (error) throw error;
  return data;
}

export async function listSheetSyncRuns(limit = 10) {
  const { data, error } = await supabase
    .from("sheet_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export { MONTHLY_TABS };
