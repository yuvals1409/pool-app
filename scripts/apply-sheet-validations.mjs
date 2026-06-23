#!/usr/bin/env node
/**
 * Re-apply data validation only (no data rewrite).
 *   node scripts/apply-sheet-validations.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseGroupsFromSources } from "./lib/parse-groups-from-xlsx.mjs";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
} from "./lib/google-sheets-client.mjs";
import { applyAllValidations } from "./lib/sheet-validation-upload.mjs";

const args = process.argv.slice(2);
const annualPath = args.includes("--annual") ? args[args.indexOf("--annual") + 1] : "data/import/stream-line-2025-26.xlsx";
const summerPath = args.includes("--summer") ? args[args.indexOf("--summer") + 1] : "data/import/summer-2026.xlsx";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();
const sa = loadServiceAccountFromEnv();
const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
if (!sa || !spreadsheetId) {
  console.error("Need GOOGLE_SERVICE_ACCOUNT_JSON and SHEETS_SPREADSHEET_ID");
  process.exit(1);
}

const catalog = parseGroupsFromSources({
  annualSheets: existsSync(annualPath) ? loadWorkbook(annualPath) : null,
  summerSheets: existsSync(summerPath) ? loadWorkbook(summerPath) : null,
});

const token = await getGoogleAccessToken(sa);
const result = await applyAllValidations(token, spreadsheetId, catalog);
console.log(`Applied ${result.validationRules} validations, deduped at import: ${catalog.stats.dedupedRemoved ?? 0}, schedule: ${result.scheduleRows} rows, slots: ${result.derivedSlots}`);
