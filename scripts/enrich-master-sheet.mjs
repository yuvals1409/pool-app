#!/usr/bin/env node
/**
 * Enrich master sheet rows: auto גיל/כיתה + "-" for N/A fields.
 *
 * Local CSV:
 *   node scripts/enrich-master-sheet.mjs --csv ./data/import/master-sheet/מאסטר_סנכרון.csv
 *
 * Google Sheet (needs GOOGLE_SERVICE_ACCOUNT_JSON + SHEETS_SPREADSHEET_ID):
 *   node scripts/enrich-master-sheet.mjs --from-google --upload
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MASTER_TAB, MASTER_HEADERS } from "./lib/master-sheet-schema.mjs";
import { enrichMasterSheetData } from "./lib/master-sheet-enrich.mjs";
import {
  loadServiceAccountFromEnv,
  getGoogleAccessToken,
  readSheetTab,
  writeSheetTab,
} from "./lib/google-sheets-client.mjs";

const args = process.argv.slice(2);
const csvPath = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : null;
const fromGoogle = args.includes("--from-google");
const upload = args.includes("--upload");

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  return lines.map((line) => {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function toCsv(rows) {
  return rows.map((row) => row.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

async function main() {
  if (fromGoogle) {
    const sa = loadServiceAccountFromEnv();
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error("SHEETS_SPREADSHEET_ID required");
    const token = await getGoogleAccessToken(sa);
    const sheetRows = await readSheetTab(token, spreadsheetId, MASTER_TAB);
    const { rows, changed } = enrichMasterSheetData(sheetRows);
    console.log(`Rows: ${rows.length - 1}, changed: ${changed}`);
    if (upload && changed) {
      await writeSheetTab(token, spreadsheetId, MASTER_TAB, rows);
      console.log("Uploaded enriched data to Google Sheet");
    } else if (!upload) {
      console.log("Dry-run — add --upload to write back to Google");
    }
    return;
  }

  if (!csvPath) {
    console.error("Usage: --csv path | --from-google [--upload]");
    process.exit(1);
  }

  const abs = resolve(csvPath);
  const raw = readFileSync(abs, "utf8");
  const rows = parseCsv(raw);
  if (rows[0]?.join(",") !== MASTER_HEADERS.join(",")) {
    rows[0] = MASTER_HEADERS;
  }
  const { rows: enriched, changed } = enrichMasterSheetData(rows);
  const out = abs.replace(/\.csv$/i, "") + ".enriched.csv";
  writeFileSync(out, toCsv(enriched), "utf8");
  console.log(`Wrote ${out} (${enriched.length - 1} rows, changed: ${changed})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
