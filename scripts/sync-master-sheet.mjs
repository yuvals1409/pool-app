#!/usr/bin/env node
/**
 * Dry-run or execute master sheet sync.
 *
 *   node scripts/sync-master-sheet.mjs --dry-run --csv ./data/import/master-sheet/מאסטר_סנכרון.csv
 *   node scripts/sync-master-sheet.mjs --global-ready --csv ...   (requires .env Supabase keys)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseMasterRows,
  isGlobalReady,
  runMasterSync,
  MASTER_TAB,
} from "./lib/master-sync-engine.mjs";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
  readSheetTab,
} from "./lib/google-sheets-client.mjs";
import { CONFIG_TAB } from "./lib/master-sheet-schema.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceGlobal = args.includes("--global-ready");
const csvPath = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : null;
const fromGoogle = args.includes("--from-google");

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let masterSheetRows;
let globalReady = forceGlobal;

if (fromGoogle) {
  const sa = loadServiceAccountFromEnv();
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!sa || !spreadsheetId) {
    console.error("Need GOOGLE_SERVICE_ACCOUNT_JSON and SHEETS_SPREADSHEET_ID");
    process.exit(1);
  }
  const token = await getGoogleAccessToken(sa);
  masterSheetRows = await readSheetTab(token, spreadsheetId, MASTER_TAB);
  const configRows = await readSheetTab(token, spreadsheetId, CONFIG_TAB);
  globalReady = globalReady || isGlobalReady(configRows);
} else if (csvPath) {
  masterSheetRows = parseCsv(resolve(csvPath));
  globalReady = forceGlobal;
} else {
  console.error("Provide --csv PATH or --from-google");
  process.exit(1);
}

const masterRows = parseMasterRows(masterSheetRows);
const readyCount = masterRows.filter((r) => r["מוכן_לסנכרון"] === "כן").length;

console.log(`Master rows: ${masterRows.length}, ready: ${readyCount}, global: ${globalReady ? "כן" : "לא"}`);

if (dryRun) {
  for (const row of masterRows.filter((r) => r["מוכן_לסנכרון"] === "כן").slice(0, 20)) {
    console.log(`[dry-run] ${row["סוג_רשומה"]} | ${row["שם_פרטי"]} ${row["שם_משפחה"]} | ${row["טלפון_הורה"]}`);
  }
  if (readyCount > 20) console.log(`... and ${readyCount - 20} more`);
  process.exit(0);
}

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = await runMasterSync({ supabase, masterRows, globalReady, dryRun: false });
console.log(JSON.stringify(results, null, 2));

await supabase.from("sheet_sync_runs").insert({
  direction: "pull",
  sheet_tab: MASTER_TAB,
  status: results.failed ? "partial" : results.blocked ? "failed" : "ok",
  rows_in: results.synced,
  errors: results.errors,
  finished_at: new Date().toISOString(),
});
