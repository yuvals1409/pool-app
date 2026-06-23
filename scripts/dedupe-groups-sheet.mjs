#!/usr/bin/env node
/**
 * Deduplicate קבוצות tab + refresh derived tabs.
 *   node scripts/dedupe-groups-sheet.mjs           # dry-run report
 *   node scripts/dedupe-groups-sheet.mjs --apply   # write to Google Sheet
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
  readSheetTab,
  writeSheetTab,
  clearSheetTab,
} from "./lib/google-sheets-client.mjs";
import { GROUPS_TAB } from "./lib/groups-sheet-schema.mjs";
import { dedupeGroupSheetRows } from "./lib/groups-dedupe.mjs";
import { applyAllValidations } from "./lib/sheet-validation-upload.mjs";
import { parseGroupsFromSources } from "./lib/parse-groups-from-xlsx.mjs";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";

const apply = process.argv.includes("--apply");
const annualPath = process.argv.includes("--annual")
  ? process.argv[process.argv.indexOf("--annual") + 1]
  : "data/import/stream-line-2025-26.xlsx";
const summerPath = process.argv.includes("--summer")
  ? process.argv[process.argv.indexOf("--summer") + 1]
  : "data/import/summer-2026.xlsx";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function summarizeRemoved(removed, hdr) {
  const nameIdx = hdr.indexOf("שם_קבוצה");
  const srcIdx = hdr.indexOf("מקור_שם_אקסל");
  return removed.map((item) => {
    const row = item.row || item.group;
    const name = row?.[nameIdx] || row?.name || "";
    const src = row?.[srcIdx] || row?.excelSourceName || "";
    return { reason: item.reason, name, src };
  });
}

loadEnv();

const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
if (!spreadsheetId) throw new Error("missing SHEETS_SPREADSHEET_ID");

const token = await getGoogleAccessToken(loadServiceAccountFromEnv());
const groupsRows = await readSheetTab(token, spreadsheetId, GROUPS_TAB, "U");
const before = groupsRows.length - 1;

const { rows, removed, renamed } = dedupeGroupSheetRows(groupsRows);
const after = rows.length - 1;
const hdr = rows[0];

console.log(`קבוצות: ${before} → ${after} (הוסרו ${removed.length}, שמות עודכנו ${renamed})`);
for (const item of summarizeRemoved(removed, hdr)) {
  console.log(`  - [${item.reason}] ${item.name}${item.src ? ` (${item.src})` : ""}`);
}

const reportPath = join("data/import", "groups-dedupe-report.json");
mkdirSync(resolve("data/import"), { recursive: true });
writeFileSync(reportPath, JSON.stringify({
  before,
  after,
  removed: summarizeRemoved(removed, hdr),
  renamed,
}, null, 2));
console.log(`Report: ${reportPath}`);

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to update the sheet.");
  process.exit(0);
}

await clearSheetTab(token, spreadsheetId, GROUPS_TAB);
await writeSheetTab(token, spreadsheetId, GROUPS_TAB, rows);

let catalog = null;
if (existsSync(resolve(annualPath)) || existsSync(resolve(summerPath))) {
  try {
    const annualSheets = existsSync(resolve(annualPath)) ? loadWorkbook(annualPath) : null;
    const summerSheets = existsSync(resolve(summerPath)) ? loadWorkbook(summerPath) : null;
    catalog = parseGroupsFromSources({ annualSheets, summerSheets });
    console.log(`Import catalog dedupe preview: ${catalog.stats.dedupedRemoved ?? 0} would be removed on full rebuild`);
  } catch {
    // optional
  }
}

const result = await applyAllValidations(token, spreadsheetId, catalog);
console.log("Applied:", result);
