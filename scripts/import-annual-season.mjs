#!/usr/bin/env node
/**
 * Stream Line OS — ייבוא חד-פעמי מקובץ stream line עונת 2025_26.xlsx
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-annual-season.mjs "/path/to/file.xlsx"
 *
 * Optional flags:
 *   --dry-run   Parse only, print report, no DB writes
 *   --reset     Delete existing 2025/26 season data before import
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DAY_SHEETS = ["שני", "שלישי", "רביעי", "חמישי", "שישי"];
const DAY_MAP = { שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5 };
const SEASON_NAME = "2025/26";
const SEASON_START = "2025-09-01";
const SEASON_END = "2026-06-30";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reset = args.includes("--reset");
const emitSql = args.includes("--emit-sql");
const xlsxPath = args.find((a) => !a.startsWith("--"));

if (!xlsxPath) {
  console.error("Usage: node scripts/import-annual-season.mjs [--dry-run] [--reset] \"/path/to/stream line.xlsx\"");
  process.exit(1);
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && !emitSql && (!supabaseUrl || !serviceKey)) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = !dryRun && !emitSql
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// ── .env loader ─────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ── XLSX (extract via unzip, parse OOXML) ───────────────────
function extractXlsx(path) {
  const dir = mkdtempSync(join(tmpdir(), "stream-line-xlsx-"));
  execFileSync("unzip", ["-q", "-o", path, "-d", dir], { stdio: "pipe" });
  return dir;
}

function readExtractedFile(dir, relPath) {
  return readFileSync(join(dir, relPath), "utf8");
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    const parts = [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]);
    strings.push(parts.join(""));
  }
  return strings;
}

function colToNum(col) {
  let n = 0;
  for (const c of col) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, strings) {
  const rows = new Map();
  const rowRe = /<row[^>]* r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const ri = Number(rm[1]);
    const cells = {};
    const cellRe = /<c[^>]* r="([A-Z]+\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const col = cm[1].match(/^([A-Z]+)/)[1];
      const t = /t="([^"]+)"/.exec(cm[2])?.[1];
      const raw = cm[3];
      if (raw == null) continue;
      cells[colToNum(col)] = t === "s" ? strings[Number(raw)] : raw;
    }
    rows.set(ri, cells);
  }
  return rows;
}

function loadWorkbook(path) {
  const dir = extractXlsx(path);
  try {
    const strings = parseSharedStrings(readExtractedFile(dir, "xl/sharedStrings.xml"));
    const wb = readExtractedFile(dir, "xl/workbook.xml");
    const rels = readExtractedFile(dir, "xl/_rels/workbook.xml.rels");
    const ridMap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const sheets = {};
    for (const m of wb.matchAll(/<sheet[^>]* name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const target = ridMap[m[2]].replace(/^\//, "");
      sheets[m[1]] = parseSheet(readExtractedFile(dir, `xl/${target}`), strings);
    }
    return sheets;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Normalization helpers ───────────────────────────────────
function normalizeClientId(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (/e/i.test(s)) {
    const [mantissa, expPart] = s.toLowerCase().split("e");
    const exp = Number(expPart);
    const [intPart, decPart = ""] = mantissa.split(".");
    const digits = intPart + decPart;
    const shift = exp - decPart.length;
    if (shift >= 0) return digits + "0".repeat(shift);
    return digits.slice(0, digits.length + shift);
  }
  return s.replace(/\.0$/, "").replace(/\s/g, "");
}

function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/\s/g, "").trim();
}

function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function parseTimeRange(line) {
  const m = String(line).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const pad = (t) => {
    const [h, min] = t.split(":");
    return `${h.padStart(2, "0")}:${min.padStart(2, "0")}:00`;
  };
  return { start: pad(m[1]), end: pad(m[2]) };
}

function parsePeriod(periodText, subscriptionText) {
  const text = `${periodText || ""} ${subscriptionText || ""}`;
  let validFrom = SEASON_START;
  let validUntil = SEASON_END;

  if (/אמצע\s*אוקטובר|אמצע-אוקטובר/i.test(text)) validFrom = "2025-10-15";
  else if (/אוקטובר/i.test(text) && !/ספטמבר/i.test(periodText || "")) validFrom = "2025-10-01";
  else if (/דצמבר/i.test(periodText || "")) validFrom = "2025-12-01";
  else if (/נובמבר/i.test(periodText || "")) validFrom = "2025-11-01";

  if (/עד\s*סוף\s*מאי|עד\s*מאי/i.test(subscriptionText || "")) validUntil = "2026-05-31";
  else if (/עד\s*סוף\s*מרץ|עד\s*מרץ/i.test(subscriptionText || "")) validUntil = "2026-03-31";

  return { validFrom, validUntil };
}

function isPaid(val) {
  const s = String(val ?? "").trim();
  return s === "1" || s === "1.0" || s === "true";
}

function productKey(day, instructor, start, end, classType) {
  return `${day}|${instructor}|${start}|${end}|${classType}`;
}

// ── Parse workbook ──────────────────────────────────────────
function parseAnnualData(sheets) {
  const stats = {
    products: 0,
    enrollments: 0,
    skippedUnpaid: 0,
    scientificNotationFixed: 0,
    dualEnrollments: 0,
    cancellations: 0,
  };
  const products = [];
  const enrollments = [];
  const families = new Map();
  const participants = new Map();
  const cancellations = [];

  for (const day of DAY_SHEETS) {
    const rows = sheets[day];
    if (!rows) continue;
    const maxRow = Math.max(...rows.keys());
    let r = 1;
    while (r <= maxRow) {
      const instructor = normalizeName(rows.get(r)?.[1]);
      const timeLine = rows.get(r + 1)?.[1];
      const classType = normalizeName(rows.get(r + 2)?.[1]);
      const times = parseTimeRange(timeLine);
      if (instructor && times && classType && !classType.includes("מס' לקוח")) {
        const prod = {
          key: productKey(day, instructor, times.start, times.end, classType),
          day,
          dayOfWeek: DAY_MAP[day],
          instructor,
          startTime: times.start,
          endTime: times.end,
          name: classType,
        };
        products.push(prod);
        stats.products++;

        let rr = r + 4;
        while (rows.has(rr)) {
          const cells = rows.get(rr);
          const childName = normalizeName(cells[3]);
          if (!childName) break;
          if (String(cells[2] || "").includes("מס' לקוח")) { rr++; continue; }

          if (!isPaid(cells[9])) {
            stats.skippedUnpaid++;
            rr++;
            continue;
          }

          const rawClientId = cells[2];
          const clientId = normalizeClientId(rawClientId);
          if (rawClientId && /e/i.test(String(rawClientId))) stats.scientificNotationFixed++;

          const phone = normalizePhone(cells[7]);
          const parent = normalizeName(cells[6]);
          const period = parsePeriod(cells[10], cells[8]);

          if (phone) families.set(phone, { phone, parentName: parent, email: null });

          const partKey = clientId || `${childName}|${phone}`;
          if (!participants.has(partKey)) {
            participants.set(partKey, {
              key: partKey,
              fullName: childName,
              phone,
              parentName: parent,
              clientId,
              gender: cells[5] ? String(cells[5]).trim() : null,
            });
          }

          enrollments.push({
            productKey: prod.key,
            participantKey: partKey,
            paymentStatus: "paid",
            validFrom: period.validFrom,
            validUntil: period.validUntil,
            notes: cells[12] ? String(cells[12]).trim() : null,
          });
          stats.enrollments++;
          rr++;
        }
        r = rr;
        continue;
      }
      r++;
    }
  }

  const cancelRows = sheets["ביטולים"];
  if (cancelRows) {
    for (const [ri, cells] of cancelRows) {
      if (ri < 5) continue;
      const name = normalizeName(cells[3]);
      if (!name) continue;
      const rawClientId = cells[2];
      const clientId = normalizeClientId(rawClientId);
      if (rawClientId && /e/i.test(String(rawClientId))) stats.scientificNotationFixed++;
      cancellations.push({
        clientId,
        fullName: name,
        phone: normalizePhone(cells[7]),
        placement: cells[14] ? String(cells[14]).trim() : null,
      });
      stats.cancellations++;
    }
  }

  const enrollCountByChild = new Map();
  for (const e of enrollments) {
    enrollCountByChild.set(e.participantKey, (enrollCountByChild.get(e.participantKey) || 0) + 1);
  }
  stats.dualEnrollments = [...enrollCountByChild.values()].filter((n) => n > 1).length;

  return { products, enrollments, families, participants, cancellations, stats };
}

function matchProductFromPlacement(placement, products) {
  if (!placement) return null;
  const dayMatch = DAY_SHEETS.find((d) => placement.includes(d));
  const time = parseTimeRange(placement);
  if (!dayMatch && !time) return null;
  const candidates = products.filter((p) => {
    if (dayMatch && p.day !== dayMatch) return false;
    if (time && p.startTime.slice(0, 5) !== time.start.slice(0, 5)) return false;
    if (placement.includes(p.instructor.split(" ")[0])) return true;
    return !placement.match(/שקד|דניאל|מורן|גל|ענתבי/i);
  });
  return candidates[0] || null;
}

// ── DB import ───────────────────────────────────────────────
async function resetSeason() {
  const { data: seasons } = await supabase.from("seasons").select("id").eq("name", SEASON_NAME);
  if (!seasons?.length) return;
  const seasonId = seasons[0].id;
  const { data: prods } = await supabase.from("products").select("id").eq("season_id", seasonId);
  const prodIds = (prods || []).map((p) => p.id);
  if (prodIds.length) {
    await supabase.from("enrollments").delete().in("product_id", prodIds);
    await supabase.from("products").delete().eq("season_id", seasonId);
  }
  await supabase.from("seasons").delete().eq("id", seasonId);
  await supabase.from("participants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("families").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

async function runImport(data) {
  const { products, enrollments, families, participants, cancellations, stats } = data;

  const { data: tpl, error: tplErr } = await supabase
    .from("product_templates")
    .select("id")
    .eq("code", "annual_section")
    .single();
  if (tplErr) throw tplErr;

  if (reset) await resetSeason();

  const { data: existingSeason } = await supabase.from("seasons").select("id").eq("name", SEASON_NAME).maybeSingle();
  if (existingSeason) {
    throw new Error(`Season ${SEASON_NAME} already exists. Use --reset to re-import.`);
  }

  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .insert({ name: SEASON_NAME, start_date: SEASON_START, end_date: SEASON_END, active: true })
    .select("id")
    .single();
  if (seasonErr) throw seasonErr;

  const productIdByKey = new Map();
  for (const p of products) {
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        season_id: season.id,
        template_id: tpl.id,
        name: p.name,
        day_of_week: p.dayOfWeek,
        start_time: p.startTime,
        end_time: p.endTime,
        instructor_name: p.instructor,
      })
      .select("id")
      .single();
    if (error) throw error;
    productIdByKey.set(p.key, row.id);
  }

  const familyIdByPhone = new Map();
  for (const fam of families.values()) {
    const { data: row, error } = await supabase
      .from("families")
      .insert({ phone: fam.phone, parent_name: fam.parentName, email: fam.email })
      .select("id")
      .single();
    if (error) throw error;
    familyIdByPhone.set(fam.phone, row.id);
  }

  const participantIdByKey = new Map();
  for (const part of participants.values()) {
    const familyId = familyIdByPhone.get(part.phone);
    if (!familyId) continue;
    const { data: row, error } = await supabase
      .from("participants")
      .insert({
        family_id: familyId,
        full_name: part.fullName,
        gender: part.gender,
        external_client_id: part.clientId,
      })
      .select("id")
      .single();
    if (error) throw error;
    participantIdByKey.set(part.key, row.id);
  }

  const enrollmentRows = enrollments.map((e) => ({
    product_id: productIdByKey.get(e.productKey),
    participant_id: participantIdByKey.get(e.participantKey),
    payment_status: e.paymentStatus,
    valid_from: e.validFrom,
    valid_until: e.validUntil,
    active: true,
    notes: e.notes,
  }));

  const BATCH = 50;
  for (let i = 0; i < enrollmentRows.length; i += BATCH) {
    const batch = enrollmentRows.slice(i, i + BATCH);
    const { error } = await supabase.from("enrollments").insert(batch);
    if (error) throw error;
  }

  let deactivated = 0;
  for (const c of cancellations) {
    const partKey = c.clientId || `${c.fullName}|${c.phone}`;
    let participantId = participantIdByKey.get(partKey);
    if (!participantId && c.clientId) {
      const { data: found } = await supabase
        .from("participants")
        .select("id")
        .eq("external_client_id", c.clientId)
        .maybeSingle();
      participantId = found?.id;
    }
    if (!participantId) continue;

    const matchedProduct = matchProductFromPlacement(c.placement, products);
    if (matchedProduct) {
      const productId = productIdByKey.get(matchedProduct.key);
      const { error } = await supabase
        .from("enrollments")
        .update({ active: false })
        .eq("participant_id", participantId)
        .eq("product_id", productId);
      if (!error) deactivated++;
    } else {
      const { error } = await supabase
        .from("enrollments")
        .update({ active: false })
        .eq("participant_id", participantId);
      if (!error) deactivated += 1;
    }
  }

  stats.deactivated = deactivated;
  return { seasonId: season.id, stats };
}

function sqlStr(val) {
  if (val == null) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildImportSql(data) {
  const seasonId = randomUUID();
  const templateSubquery = `(SELECT id FROM product_templates WHERE code = 'annual_section' LIMIT 1)`;
  const lines = [
    "BEGIN;",
    `INSERT INTO seasons (id, name, start_date, end_date, active) VALUES ('${seasonId}', ${sqlStr(SEASON_NAME)}, ${sqlStr(SEASON_START)}, ${sqlStr(SEASON_END)}, true);`,
  ];

  const productIdByKey = new Map();
  for (const p of data.products) {
    const id = randomUUID();
    productIdByKey.set(p.key, id);
    lines.push(
      `INSERT INTO products (id, season_id, template_id, name, day_of_week, start_time, end_time, instructor_name) VALUES ('${id}', '${seasonId}', ${templateSubquery}, ${sqlStr(p.name)}, ${p.dayOfWeek}, ${sqlStr(p.startTime)}, ${sqlStr(p.endTime)}, ${sqlStr(p.instructor)});`,
    );
  }

  const familyIdByPhone = new Map();
  for (const fam of data.families.values()) {
    const id = randomUUID();
    familyIdByPhone.set(fam.phone, id);
    lines.push(
      `INSERT INTO families (id, phone, parent_name, email) VALUES ('${id}', ${sqlStr(fam.phone)}, ${sqlStr(fam.parentName)}, NULL);`,
    );
  }

  const participantIdByKey = new Map();
  for (const part of data.participants.values()) {
    const familyId = familyIdByPhone.get(part.phone);
    if (!familyId) continue;
    const id = randomUUID();
    participantIdByKey.set(part.key, id);
    lines.push(
      `INSERT INTO participants (id, family_id, full_name, gender, external_client_id) VALUES ('${id}', '${familyId}', ${sqlStr(part.fullName)}, ${sqlStr(part.gender)}, ${sqlStr(part.clientId)});`,
    );
  }

  for (const e of data.enrollments) {
    const productId = productIdByKey.get(e.productKey);
    const participantId = participantIdByKey.get(e.participantKey);
    if (!productId || !participantId) continue;
    lines.push(
      `INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active, notes) VALUES ('${productId}', '${participantId}', ${sqlStr(e.paymentStatus)}, ${sqlStr(e.validFrom)}, ${sqlStr(e.validUntil)}, true, ${sqlStr(e.notes)});`,
    );
  }

  for (const c of data.cancellations) {
    const partKey = c.clientId || `${c.fullName}|${c.phone}`;
    const participantId = participantIdByKey.get(partKey);
    if (!participantId) continue;
    const matched = matchProductFromPlacement(c.placement, data.products);
    if (matched) {
      const productId = productIdByKey.get(matched.key);
      lines.push(
        `UPDATE enrollments SET active = false WHERE participant_id = '${participantId}' AND product_id = '${productId}';`,
      );
    } else {
      lines.push(`UPDATE enrollments SET active = false WHERE participant_id = '${participantId}';`);
    }
  }

  lines.push("COMMIT;");
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────
const sheets = loadWorkbook(resolve(xlsxPath));
const data = parseAnnualData(sheets);

console.log("=== Stream Line import report ===");
console.log(`Products: ${data.stats.products}`);
console.log(`Enrollments: ${data.stats.enrollments}`);
console.log(`Families: ${data.families.size}`);
console.log(`Participants: ${data.participants.size}`);
console.log(`Cancellations sheet rows: ${data.stats.cancellations}`);
console.log(`Kids with 2+ classes: ${data.stats.dualEnrollments}`);
console.log(`Scientific notation IDs fixed: ${data.stats.scientificNotationFixed}`);
console.log(`Skipped unpaid rows: ${data.stats.skippedUnpaid}`);

if (dryRun) {
  console.log("\nDry run — no database changes.");
  process.exit(0);
}

if (emitSql) {
  const outPath = resolve(process.cwd(), "scripts/import-annual-season.sql");
  writeFileSync(outPath, buildImportSql(data), "utf8");
  console.log(`\nWrote SQL to ${outPath}`);
  process.exit(0);
}

try {
  const result = await runImport(data);
  console.log(`\nImport complete. Season id: ${result.seasonId}`);
  console.log(`Enrollments deactivated: ${result.stats.deactivated ?? 0}`);

  const { data: sessionsCreated, error: sessErr } = await supabase.rpc("generate_weekly_sessions", {
    p_from: new Date().toISOString().slice(0, 10),
    p_to: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });
  if (sessErr) throw sessErr;

  const { data: passesCreated, error: passErr } = await supabase.rpc("generate_access_passes", {
    p_from: new Date().toISOString().slice(0, 10),
    p_to: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });
  if (passErr) throw passErr;

  console.log(`Sessions generated: ${sessionsCreated}`);
  console.log(`Access passes generated: ${passesCreated}`);
} catch (err) {
  console.error("Import failed:", err.message || err);
  process.exit(1);
}
