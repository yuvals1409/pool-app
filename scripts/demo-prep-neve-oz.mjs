#!/usr/bin/env node
/**
 * דמו נווה עוז — איפוס PIN והדפסת קישור פורטל
 *
 * לפני הפגישה:
 *   1. הרץ scripts/demo-prep-neve-oz.sql ב-Supabase SQL Editor
 *   2. node scripts/demo-prep-neve-oz.mjs
 *
 * אופציונלי (מגוון תשלומים בנתונים אמיתיים):
 *   הרץ גם scripts/demo-prep-neve-oz-polish.sql
 *
 * env: SUPABASE_URL (או VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, DEMO_APP_URL
 */

import { createClient } from "@supabase/supabase-js";

const DEMO_NOAM_ID = "a1000002-0002-4002-8002-000000000001";
const DEMO_PORTAL_TOKEN = "d1000001-0001-4001-8001-000000000001";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("חסר SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await supabase.rpc("staff_reset_portal_pin", {
    p_participant_id: DEMO_NOAM_ID,
  });
  if (error) throw error;
  if (data?.result !== "ok") {
    console.error("איפוס PIN נכשל:", data);
    console.error("ודא שהרצת demo-prep-neve-oz.sql קודם");
    process.exit(1);
  }

  const appOrigin =
    process.env.DEMO_APP_URL ||
    process.env.VITE_AUTH_REDIRECT_URL?.replace(/\/$/, "") ||
    "https://YOUR-APP.vercel.app";

  const portalUrl = `${appOrigin.replace(/\/$/, "")}/k/${DEMO_PORTAL_TOKEN}`;

  console.log("\n══════════════════════════════════════");
  console.log("  פורטל דמו — נועם לוי");
  console.log("══════════════════════════════════════");
  console.log("קישור:", portalUrl);
  console.log("PIN:  ", data.portal_pin);
  console.log("══════════════════════════════════════\n");
  console.log("שמור את ה-PIN. לפני הדמו QR — מחק סריקה קודמת:");
  console.log("  DELETE FROM access_passes WHERE session_id = 'a1000004-0004-4004-8004-000000000001';");
  console.log("  SELECT generate_access_passes('2026-06-28','2026-06-28');\n");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
