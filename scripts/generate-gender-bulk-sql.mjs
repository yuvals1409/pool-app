#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import { parseAnnualData } from "./lib/parse-annual-sheet.mjs";
import { normalizeSheetGender } from "./lib/sheet-normalize.mjs";

const data = parseAnnualData(loadWorkbook("data/import/stream-line-2025-26.xlsx"));
const rows = [];
for (const part of data.participants.values()) {
  const g = normalizeSheetGender(part.gender);
  if (g && part.clientId) {
    const cid = String(part.clientId).replace(/'/g, "''");
    rows.push(`('${cid}','${g}')`);
  }
}
const sql = `UPDATE participants p SET gender = v.g
FROM (VALUES ${rows.join(",")}) AS v(cid, g)
WHERE p.external_client_id = v.cid AND p.gender_manual_at IS NULL AND (p.gender IS NULL OR p.gender != v.g);`;
writeFileSync("scripts/generated-gender-bulk.sql", sql);
console.log("rows", rows.length);
