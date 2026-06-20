#!/usr/bin/env node
/**
 * Generate SQL to reconcile annual season from xlsx + DB snapshot JSON.
 * Snapshot: node scripts/fetch-db-snapshot.mjs > data/import/db-snapshot.json (via MCP export)
 *
 * Usage:
 *   node scripts/generate-annual-resync-sql.mjs > scripts/generated-annual-resync.sql
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import { parseAnnualData, productKey as annualProductKey, DAY_MAP } from "./lib/parse-annual-sheet.mjs";
import { normalizeSheetGender } from "./lib/sheet-normalize.mjs";

const DAY_NUM_TO_NAME = Object.fromEntries(Object.entries(DAY_MAP).map(([k, v]) => [v, k]));

const xlsxPath = resolve("data/import/stream-line-2025-26.xlsx");
const snapshotPath = resolve("data/import/db-snapshot.json");

const sheets = loadWorkbook(xlsxPath);
const data = parseAnnualData(sheets);

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
} catch {
  console.error("Missing data/import/db-snapshot.json — export from Supabase first");
  process.exit(1);
}

function dbAnnualKey(p) {
  const day = DAY_NUM_TO_NAME[p.day_of_week] || "";
  const start = String(p.start_time).slice(0, 8);
  const end = String(p.end_time).slice(0, 8);
  return annualProductKey(day, p.instructor_name, start, end, p.name);
}

const productIdByKey = new Map();
for (const p of snapshot.products || []) {
  productIdByKey.set(dbAnnualKey(p), p.id);
}

const participantByClientId = new Map();
const participantByNamePhone = new Map();
for (const p of snapshot.participants || []) {
  if (p.external_client_id) participantByClientId.set(String(p.external_client_id), p);
}

const enrollmentsByParticipant = new Map();
for (const e of snapshot.enrollments || []) {
  if (!enrollmentsByParticipant.has(e.participant_id)) {
    enrollmentsByParticipant.set(e.participant_id, []);
  }
  enrollmentsByParticipant.get(e.participant_id).push(e);
}

const seasonProductIds = new Set((snapshot.products || []).map((p) => p.id));

const lines = ["-- Annual resync SQL generated", `BEGIN;`];
const report = {
  gender_updates: 0,
  payment_updates: 0,
  enrollments_cancelled: 0,
  enrollments_created: 0,
  unmatched_products: [],
  unmatched_participants: [],
};

for (const part of data.participants.values()) {
  const g = normalizeSheetGender(part.gender);
  if (g && part.clientId) {
    const cid = String(part.clientId).replace(/'/g, "''");
    lines.push(
      `UPDATE participants SET gender = '${g}' WHERE external_client_id = '${cid}' AND gender_manual_at IS NULL AND (gender IS NULL OR gender != '${g}');`,
    );
    report.gender_updates += 1;
  }
}

for (const enr of data.enrollments) {
  const part = data.participants.get(enr.participantKey);
  if (!part?.clientId) continue;

  const dbPart = participantByClientId.get(String(part.clientId));
  if (!dbPart) {
    report.unmatched_participants.push(part.clientId);
    continue;
  }

  const productId = productIdByKey.get(enr.productKey);
  if (!productId) {
    report.unmatched_products.push(enr.productKey);
    continue;
  }

  const activeRows = (enrollmentsByParticipant.get(dbPart.id) || []).filter(
    (e) => e.active && seasonProductIds.has(e.product_id),
  );

  const same = activeRows.find((e) => e.product_id === productId);
  const pay = enr.paymentStatus.replace(/'/g, "''");

  if (same) {
    if (same.payment_status !== enr.paymentStatus) {
      lines.push(
        `UPDATE enrollments SET payment_status = '${pay}' WHERE id = '${same.id}';`,
      );
      report.payment_updates += 1;
    }
  } else {
    for (const e of activeRows) {
      lines.push(
        `UPDATE enrollments SET active = false, cancelled_at = NOW() WHERE id = '${e.id}';`,
      );
      report.enrollments_cancelled += 1;
    }
    lines.push(
      `UPDATE enrollments SET active = true, payment_status = '${pay}', valid_from = '${enr.validFrom}', valid_until = '${enr.validUntil}', cancelled_at = NULL
       WHERE participant_id = '${dbPart.id}' AND product_id = '${productId}';`,
    );
    lines.push(
      `INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
       SELECT '${productId}', '${dbPart.id}', '${pay}', '${enr.validFrom}', '${enr.validUntil}', true
       WHERE NOT EXISTS (SELECT 1 FROM enrollments WHERE participant_id = '${dbPart.id}' AND product_id = '${productId}');`,
    );
    report.enrollments_created += 1;
  }
}

for (const c of data.cancellations) {
  const cid = c.clientId ? String(c.clientId).replace(/'/g, "''") : null;
  if (!cid) continue;
  const dbPart = participantByClientId.get(String(c.clientId));
  if (!dbPart) continue;
  lines.push(
    `UPDATE enrollments SET active = false, cancelled_at = NOW()
     WHERE participant_id = '${dbPart.id}' AND active = true
       AND product_id IN (SELECT id FROM products WHERE season_id = '${snapshot.season_id}');`,
  );
  report.enrollments_cancelled += 1;
}

lines.push(
  `INSERT INTO sheet_sync_runs (direction, sheet_tab, status, rows_in, finished_at)
   VALUES ('pull', 'annual_resync', 'ok', ${data.stats.enrollments}, NOW());`,
);
lines.push("COMMIT;");
lines.push(`-- report: ${JSON.stringify(report)}`);

const out = lines.join("\n");
writeFileSync("scripts/generated-annual-resync.sql", out);
console.error("Wrote scripts/generated-annual-resync.sql");
console.error(JSON.stringify(report, null, 2));
