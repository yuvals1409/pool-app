#!/usr/bin/env node
/**
 * Generate SQL to import summer season from xlsx + live participants export.
 *
 * Usage:
 *   node scripts/generate-summer-import-sql.mjs \
 *     --xlsx data/import/summer-2026.xlsx \
 *     --participants data/import/participants-live.json \
 *     > scripts/generated-summer-import.sql
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import {
  parseSummerData,
  SUMMER_SEASON_NAME,
  SUMMER_SEASON_START,
  SUMMER_SEASON_END,
} from "./lib/parse-summer-sheet.mjs";
import { normalizeName, normalizePhone, normalizeSheetGender } from "./lib/sheet-normalize.mjs";

const SUMMER_TEMPLATE_ID = "bd5a0855-1181-4c76-814c-742164fb83ae";

const args = process.argv.slice(2);
const xlsxPath = args.includes("--xlsx") ? args[args.indexOf("--xlsx") + 1] : "data/import/summer-2026.xlsx";
const participantsPath = args.includes("--participants")
  ? args[args.indexOf("--participants") + 1]
  : "data/import/participants-live.json";

function sqlStr(s) {
  return String(s ?? "").replace(/'/g, "''");
}

function phoneDigits(raw) {
  return normalizePhone(raw).replace(/\D/g, "");
}

function formatPhoneForDb(raw) {
  const d = phoneDigits(raw);
  if (d.length === 10 && d.startsWith("0")) {
    return `${d.slice(0, 3)}-${d.slice(3)}`;
  }
  return normalizePhone(raw);
}

function findParticipant(part, dbParticipants) {
  if (part.clientId) {
    const byClient = dbParticipants.find((p) => String(p.external_client_id) === String(part.clientId));
    if (byClient) return byClient;
  }
  const digits = phoneDigits(part.phone);
  if (digits && part.fullName) {
    const candidates = dbParticipants.filter((p) => phoneDigits(p.phone) === digits);
    const match = candidates.find(
      (p) => normalizeName(p.full_name).toLowerCase() === normalizeName(part.fullName).toLowerCase(),
    );
    if (match) return match;
  }
  return null;
}

const sheets = loadWorkbook(resolve(xlsxPath));
const data = parseSummerData(sheets);

let dbParticipants;
try {
  const raw = JSON.parse(readFileSync(resolve(participantsPath), "utf8"));
  dbParticipants = Array.isArray(raw) ? raw : raw.participants || [];
} catch {
  console.error(`Missing ${participantsPath} — export participants from Supabase first`);
  process.exit(1);
}

const seasonId = randomUUID();
const productIdByKey = new Map();
for (const p of data.products) {
  productIdByKey.set(p.key, randomUUID());
}

const lines = [
  "-- Summer 2026 import SQL",
  "BEGIN;",
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM seasons WHERE name = '${sqlStr(SUMMER_SEASON_NAME)}') THEN RAISE EXCEPTION 'Season already exists'; END IF; END $$;`,
  `INSERT INTO seasons (id, name, start_date, end_date, active) VALUES ('${seasonId}', '${sqlStr(SUMMER_SEASON_NAME)}', '${SUMMER_SEASON_START}', '${SUMMER_SEASON_END}', false);`,
];

for (const p of data.products) {
  const id = productIdByKey.get(p.key);
  const pattern = JSON.stringify({
    type: "course_series",
    weekdays: p.weekdays,
    course_start: p.courseStart,
    course_end: p.courseEnd,
  }).replace(/'/g, "''");
  lines.push(
    `INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('${id}', '${seasonId}', '${SUMMER_TEMPLATE_ID}', '${sqlStr(p.name)}', '${p.startTime}', '${p.endTime}', '${sqlStr(p.instructor)}', '${pattern}'::jsonb);`,
  );
}

for (const id of productIdByKey.values()) {
  lines.push(`SELECT public.generate_course_series_sessions('${id}'::uuid);`);
}

const familyLines = [];
for (const fam of data.families.values()) {
  const phone = formatPhoneForDb(fam.phone);
  const digits = phoneDigits(fam.phone);
  if (!digits) continue;
  const parent = fam.parentName ? `'${sqlStr(fam.parentName)}'` : "NULL";
  familyLines.push(
    `UPDATE families SET parent_name = COALESCE(${parent}, parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '${digits}';`,
  );
  familyLines.push(
    `INSERT INTO families (phone, parent_name)
     SELECT '${sqlStr(phone)}', ${parent}
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '${digits}'
     );`,
  );
}
lines.push(...familyLines);

const participantLines = [];
const enrollmentLines = [];
const participantIdByKey = new Map();
const report = {
  products: data.products.length,
  enrollments_existing: 0,
  enrollments_new_participant: 0,
  enrollments_unmatched: [],
  unmatched_products: [],
};

for (const enr of data.enrollments) {
  const part = data.participants.get(enr.participantKey);
  if (!part) continue;

  const productId = productIdByKey.get(enr.productKey);
  if (!productId) {
    report.unmatched_products.push(enr.productKey);
    continue;
  }

  let participantId;
  const dbPart = findParticipant(part, dbParticipants);
  if (dbPart) {
    participantId = dbPart.id;
    report.enrollments_existing += 1;
  } else {
    const digits = phoneDigits(part.phone);
    if (!digits) {
      report.enrollments_unmatched.push(part.fullName || part.key);
      continue;
    }
    if (!participantIdByKey.has(part.key)) {
      participantId = randomUUID();
      participantIdByKey.set(part.key, participantId);
      const gender = normalizeSheetGender(part.gender);
      const genderSql = gender ? `'${gender}'` : "NULL";
      const clientSql = part.clientId ? `'${sqlStr(part.clientId)}'` : "NULL";
      const digits = phoneDigits(part.phone);
      participantLines.push(
        `INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '${participantId}', f.id, '${sqlStr(part.fullName)}', ${genderSql}, ${clientSql}
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '${digits}';`,
      );
      report.enrollments_new_participant += 1;
    } else {
      participantId = participantIdByKey.get(part.key);
    }
  }

  const pay = sqlStr(enr.paymentStatus);
  enrollmentLines.push(
    `INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('${productId}', '${participantId}', '${pay}', '${enr.validFrom}', '${enr.validUntil}', true);`,
  );
}

lines.push(...participantLines, ...enrollmentLines);

lines.push(
  `INSERT INTO sheet_sync_runs (direction, sheet_tab, status, rows_in, finished_at)
   VALUES ('pull', 'summer_resync', 'ok', ${data.stats.enrollments}, NOW());`,
);
lines.push("COMMIT;");
lines.push(`-- season_id: ${seasonId}`);
lines.push(`-- report: ${JSON.stringify(report)}`);

const out = lines.join("\n");
writeFileSync("scripts/generated-summer-import.sql", out);
console.error("Wrote scripts/generated-summer-import.sql");
console.error(
  JSON.stringify(
    {
      seasonId,
      ...report,
      enrollments_total: report.enrollments_existing + report.enrollments_new_participant,
      parseStats: data.stats,
    },
    null,
    2,
  ),
);
