#!/usr/bin/env node
/**
 * Build groups + slots tabs from xlsx sources.
 *
 *   node scripts/build-groups-sheet.mjs --annual ... --summer ... --out-dir ./data/import/master-sheet
 *   node scripts/build-groups-sheet.mjs --upload --annual ... --summer ...
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import { parseGroupsFromSources, groupsToSheetData } from "./lib/parse-groups-from-xlsx.mjs";
import { GROUPS_TAB, GROUP_SLOTS_TAB, GROUP_HEADERS } from "./lib/groups-sheet-schema.mjs";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
  writeSheetTab,
  addSheetTab,
  clearSheetTab,
} from "./lib/google-sheets-client.mjs";
import { applyAllValidations } from "./lib/sheet-validation-upload.mjs";

const args = process.argv.slice(2);
const upload = args.includes("--upload");
const outDir = args.includes("--out-dir") ? args[args.indexOf("--out-dir") + 1] : "./data/import/master-sheet";
const annualPath = args.includes("--annual") ? args[args.indexOf("--annual") + 1] : null;
const summerPath = args.includes("--summer") ? args[args.indexOf("--summer") + 1] : null;

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path, rows) {
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  writeFileSync(path, `\uFEFF${body}`, "utf8");
}

loadEnv();

if (!annualPath && !summerPath) {
  console.error("Provide --annual and/or --summer");
  process.exit(1);
}

const catalog = parseGroupsFromSources({
  annualSheets: annualPath ? loadWorkbook(annualPath) : null,
  summerSheets: summerPath ? loadWorkbook(summerPath) : null,
});

const { groups: groupsData, slots: slotsData } = groupsToSheetData(catalog);

mkdirSync(resolve(outDir), { recursive: true });
writeCsv(join(outDir, "קבוצות.csv"), groupsData);
writeCsv(join(outDir, "משבצות_קבוצות.csv"), slotsData);
writeFileSync(join(outDir, "groups-summary.json"), JSON.stringify(catalog.stats, null, 2));

console.log(`Built ${catalog.groups.length} groups, ${catalog.slots.length} slots → ${outDir}`);
console.log(`  annual: ${catalog.stats.annualGroups}, summer: ${catalog.stats.summerGroups}, deduped: ${catalog.stats.dedupedRemoved ?? 0}`);

if (upload) {
  const sa = loadServiceAccountFromEnv();
  if (!sa) {
    console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
    process.exit(1);
  }
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error("Missing SHEETS_SPREADSHEET_ID");
    process.exit(1);
  }
  const token = await getGoogleAccessToken(sa);
  for (const tab of [GROUPS_TAB, GROUP_SLOTS_TAB]) {
    try {
      await addSheetTab(token, spreadsheetId, tab);
    } catch {
      // exists
    }
  }
  await clearSheetTab(token, spreadsheetId, GROUPS_TAB);
  await writeSheetTab(token, spreadsheetId, GROUPS_TAB, groupsData);
  await clearSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB);
  await writeSheetTab(token, spreadsheetId, GROUP_SLOTS_TAB, slotsData);
  const result = await applyAllValidations(token, spreadsheetId, catalog);
  console.log(`Uploaded groups tabs to ${spreadsheetId} (deduped ${catalog.stats.dedupedRemoved ?? 0}, schedule ${result.scheduleRows} rows)`);
}
