import { supabase } from "./supabase.js";

export const MASTER_TAB = "מאסטר_סנכרון";
export const MONTHLY_TABS = ["מאי", "יוני", "יולי"];

export async function triggerSheetSync(direction = "both", tabs = MONTHLY_TABS, mode = "monthly") {
  const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
    body: { direction, tabs, mode },
  });
  if (error) throw error;
  return data;
}

export async function triggerMasterSheetSync() {
  return triggerSheetSync("pull", [MASTER_TAB], "master");
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

export async function getMasterSheetConfig() {
  const { data, error } = await supabase
    .from("master_sheet_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function masterSheetUrl(spreadsheetId) {
  if (!spreadsheetId) return null;
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
