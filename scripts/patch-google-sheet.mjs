#!/usr/bin/env node
/**
 * Patch existing Google Sheet workbook to Master V2 tabs + validation.
 *
 *   node scripts/patch-google-sheet.mjs --annual ... --summer ...
 *   node scripts/patch-google-sheet.mjs --upload --annual ... --summer ...
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildMasterRowsFromSources,
  loadSourcesFromPaths,
  masterRowsToSheetData,
  parseGroupsFromSources,
} from "./lib/master-sheet-bootstrap.mjs";
import { groupsToSheetData } from "./lib/parse-groups-from-xlsx.mjs";
import {
  MASTER_TAB,
  INCOMING_LEADS_TAB,
  INCOMING_LEADS_SOURCE_TAB,
  buildIncomingLeadsImportFormula,
  CONFLICTS_TAB,
  CONFIG_TAB,
  GUIDE_TAB,
  GUIDE_CONTENT,
} from "./lib/master-sheet-schema.mjs";
import { GROUPS_TAB, GROUP_SLOTS_TAB } from "./lib/groups-sheet-schema.mjs";
import { USERS_TAB, PAY_RATES_TAB, USER_HEADERS, PAY_RATE_HEADERS } from "./lib/users-sheet-schema.mjs";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
  writeSheetTab,
  clearSheetTab,
  addSheetTab,
} from "./lib/google-sheets-client.mjs";
import { applyAllValidations } from "./lib/sheet-validation-upload.mjs";
import { slotsSheetDataFromGroupsSheet } from "./lib/groups-slots-derive.mjs";
import { formatMasterRowsForSheet, formatGroupsRowsForSheet } from "./lib/sheet-date-cells.mjs";
import { MASTER_FORMULA_FIELDS } from "./lib/sheet-master-formulas.mjs";
import { buildGroupCatalog, enrichMasterRows } from "./lib/master-sheet-enrich.mjs";

const args = process.argv.slice(2);
const upload = args.includes("--upload");
const outDir = args.includes("--out-dir") ? args[args.indexOf("--out-dir") + 1] : "./data/import/master-sheet";
const annualPath = args.includes("--annual") ? args[args.indexOf("--annual") + 1] : null;
const summerPath = args.includes("--summer") ? args[args.indexOf("--summer") + 1] : null;
const leadsPath = args.includes("--leads") ? args[args.indexOf("--leads") + 1] : null;
const leadsSpreadsheetId = process.env.SHEETS_LEADS_SPREADSHEET_ID || "";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function buildConflictsTab(rows) {
  const header = ["מפתח", "מזהה_שורה", "שם_פרטי", "שם_משפחה", "טלפון", "פירוט_קונפליקט"];
  const out = [header];
  for (const row of rows) {
    if (row["יש_קונפליקט"] !== "כן") continue;
    out.push([
      row["מס_לקוח"] || row["טלפון_הורה"],
      row["מזהה_שורה"],
      row["שם_פרטי"],
      row["שם_משפחה"],
      row["טלפון_הורה"],
      row["פירוט_קונפליקט"],
    ]);
  }
  return out;
}

async function ensureTab(token, spreadsheetId, title) {
  try {
    await addSheetTab(token, spreadsheetId, title);
  } catch {
    // already exists
  }
}

loadEnv();

if (!annualPath && !summerPath) {
  console.error("Provide --annual and/or --summer");
  process.exit(1);
}

const sources = loadSourcesFromPaths({ leadsPath, annualPath, summerPath });
const catalog = parseGroupsFromSources({
  annualSheets: sources.annualSheets,
  summerSheets: sources.summerSheets,
});
const { groups: groupsData } = groupsToSheetData(catalog);
const groupCatalog = buildGroupCatalog(catalog.groups, catalog.slots);
const rows = enrichMasterRows(
  buildMasterRowsFromSources(sources),
  groupCatalog,
);
const masterData = masterRowsToSheetData(
  formatMasterRowsForSheet(rows, {
    clearFormulaFields: [...MASTER_FORMULA_FIELDS],
  }),
);
const groupsDataFormatted = formatGroupsRowsForSheet(groupsData);
const slotsData = slotsSheetDataFromGroupsSheet(groupsDataFormatted);
const groupNames = catalog.groups.map((g) => g.name);

const tabs = {
  [GROUPS_TAB]: groupsDataFormatted,
  [GROUP_SLOTS_TAB]: slotsData,
  [USERS_TAB]: [USER_HEADERS],
  [PAY_RATES_TAB]: [PAY_RATE_HEADERS],
  [MASTER_TAB]: masterData,
  [CONFLICTS_TAB]: buildConflictsTab(rows),
  [CONFIG_TAB]: [
    ["מוכן_לסנכרון_כללי", "לא"],
    ["הערות", "V2: תקנו קבוצות לפני סנכרון ראשון"],
    ["SHEETS_LEADS_SPREADSHEET_ID", leadsSpreadsheetId || "(הגדירו ב-.env)"],
    ["SHEETS_LEADS_SOURCE_TAB", INCOMING_LEADS_SOURCE_TAB],
  ],
  [GUIDE_TAB]: GUIDE_CONTENT,
};

mkdirSync(resolve(outDir), { recursive: true });
writeFileSync(join(outDir, "patch-summary.json"), JSON.stringify({
  groups: catalog.groups.length,
  slots: catalog.slots.length,
  dedupedRemoved: catalog.stats.dedupedRemoved ?? 0,
  masterRows: rows.length,
  sampleNames: groupNames.slice(0, 5),
}, null, 2));

console.log(`Patch ready: ${catalog.groups.length} groups (${catalog.stats.dedupedRemoved ?? 0} deduped), ${rows.length} master rows`);

if (upload) {
  const sa = loadServiceAccountFromEnv();
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!sa || !spreadsheetId) {
    console.error("Need GOOGLE_SERVICE_ACCOUNT_JSON and SHEETS_SPREADSHEET_ID");
    process.exit(1);
  }
  const token = await getGoogleAccessToken(sa);

  for (const name of Object.keys(tabs)) {
    await ensureTab(token, spreadsheetId, name);
    await clearSheetTab(token, spreadsheetId, name);
    await writeSheetTab(token, spreadsheetId, name, tabs[name]);
  }

  if (leadsSpreadsheetId) {
    const formula = buildIncomingLeadsImportFormula(leadsSpreadsheetId);
    await writeSheetTab(token, spreadsheetId, INCOMING_LEADS_TAB, [[formula]]);
  }

  const result = await applyAllValidations(token, spreadsheetId, catalog);
  console.log(`Patched https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  console.log(`  validations: ${result.validationRules}, schedule rows: ${result.scheduleRows}, derived slots: ${result.derivedSlots}`);
}
