#!/usr/bin/env node
/**
 * Bootstrap master Google Sheet V2 from xlsx sources.
 *
 *   node scripts/build-master-sheet.mjs --annual ... --summer ... --out-dir ./data/import/master-sheet
 *   node scripts/patch-google-sheet.mjs --upload ...  (preferred for existing workbook)
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
  CONFLICTS_TAB,
  CONFIG_TAB,
  GUIDE_TAB,
  GUIDE_CONTENT,
  MASTER_HEADERS,
  HEADER_INDEX,
} from "./lib/master-sheet-schema.mjs";
import { GROUPS_TAB, GROUP_SLOTS_TAB } from "./lib/groups-sheet-schema.mjs";
import { USERS_TAB, PAY_RATES_TAB, USER_HEADERS, PAY_RATE_HEADERS } from "./lib/users-sheet-schema.mjs";

const args = process.argv.slice(2);
const outDir = args.includes("--out-dir") ? args[args.indexOf("--out-dir") + 1] : "./data/import/master-sheet";
const leadsPath = args.includes("--leads") ? args[args.indexOf("--leads") + 1] : null;
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

loadEnv();

if (!leadsPath && !annualPath && !summerPath) {
  console.error("Provide at least one of --leads --annual --summer");
  process.exit(1);
}

const sources = loadSourcesFromPaths({ leadsPath, annualPath, summerPath });
const catalog = parseGroupsFromSources({
  annualSheets: sources.annualSheets,
  summerSheets: sources.summerSheets,
});
const { groups: groupsData, slots: slotsData } = groupsToSheetData(catalog);
const rows = buildMasterRowsFromSources(sources);
const masterData = masterRowsToSheetData(rows);

mkdirSync(resolve(outDir), { recursive: true });
writeCsv(join(outDir, "מאסטר_סנכרון.csv"), masterData);
writeCsv(join(outDir, "קבוצות.csv"), groupsData);
writeCsv(join(outDir, "משבצות_קבוצות.csv"), slotsData);
writeCsv(join(outDir, "קונפליקטים.csv"), buildConflictsTab(rows));
writeFileSync(join(outDir, "summary.json"), JSON.stringify({
  totalRows: rows.length,
  byType: Object.fromEntries(
    Object.entries(Object.groupBy(rows, (r) => r["סוג_רשומה"])).map(([k, v]) => [k, v.length]),
  ),
  groups: catalog.stats,
  conflicts: rows.filter((r) => r["יש_קונפליקט"] === "כן").length,
  incomplete: rows.filter((r) => r["שלמות_נתונים"] === "לא").length,
}, null, 2));

console.log(`Built V2: ${catalog.groups.length} groups, ${rows.length} master rows → ${outDir}`);
console.log(`  conflicts: ${rows.filter((r) => r["יש_קונפליקט"] === "כן").length}`);
console.log(`  incomplete: ${rows.filter((r) => r["שלמות_נתונים"] === "לא").length}`);
console.log("For Google upload use: node scripts/patch-google-sheet.mjs --upload ...");
