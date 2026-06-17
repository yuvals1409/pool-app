#!/usr/bin/env node
/**
 * Stream Line OS — ייבוא קורס קיץ 2026 מקובץ Excel
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-summer-course.mjs "/path/to/קיץ 2026.xlsx"
 *
 * Flags:
 *   --dry-run   Parse only, print report
 *   --reset     Delete קיץ 2026 season data before import
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SEASON_NAME = "קיץ 2026";
const SEASON_START = "2026-05-25";
const SEASON_END = "2026-07-02";
const IMPORT_SHEET = "לימוד (מאי)";

const HEB_DAY_MAP = { "ב": 2, "ג": 3, "ד": 4, "ה": 4, "ו": 5 };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reset = args.includes("--reset");
const xlsxPath = args.find((a) => !a.startsWith("--"));

if (!xlsxPath) {
  console.error("Usage: node scripts/import-summer-course.mjs [--dry-run] [--reset] \"/path/to/summer.xlsx\"");
  process.exit(1);
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!supabaseUrl || !serviceKey)) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = dryRun
  ? null
  : createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function extractXlsx(path) {
  const dir = mkdtempSync(join(tmpdir(), "summer-xlsx-"));
  execFileSync("unzip", ["-q", "-o", path, "-d", dir], { stdio: "pipe" });
  return dir;
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const parts = [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]);
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
    const strings = parseSharedStrings(readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8"));
    const wb = readFileSync(join(dir, "xl/workbook.xml"), "utf8");
    const rels = readFileSync(join(dir, "xl/_rels/workbook.xml.rels"), "utf8");
    const ridMap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const sheets = {};
    for (const m of wb.matchAll(/<sheet[^>]* name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const target = ridMap[m[2]].replace(/^\//, "");
      sheets[m[1]] = parseSheet(readFileSync(join(dir, `xl/${target}`)), strings);
    }
    return sheets;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
  let s = String(raw).replace(/\s/g, "").trim();
  if (/e/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.round(n));
  }
  if (s.startsWith("5") && s.length === 9) s = `0${s}`;
  return s;
}

function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function parseHebrewDate(text) {
  const m = String(text).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  return `2026-${month}-${day}`;
}

function parseWeekdays(text) {
  const days = new Set();
  for (const part of String(text).split("+")) {
    const letter = part.replace(/['\s]/g, "").trim()[0];
    if (letter && HEB_DAY_MAP[letter] != null) days.add(HEB_DAY_MAP[letter]);
  }
  return [...days].sort();
}

function parseTimeRange(str) {
  const first = String(str).split("+")[0].trim();
  const range = first.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  const pad = (t) => {
    const [h, min] = t.split(":");
    return `${h.padStart(2, "0")}:${min.padStart(2, "0")}:00`;
  };
  if (range) return { start: pad(range[1]), end: pad(range[2]) };
  const single = first.match(/(\d{1,2}:\d{2})/);
  if (single) {
    const start = pad(single[1]);
    const [h, m] = start.split(":").map(Number);
    const endMin = h * 60 + m + 45;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`;
    return { start, end };
  }
  return { start: "17:30:00", end: "18:15:00" };
}

function isPaid(val) {
  const s = String(val ?? "").trim();
  return s === "1" || s === "1.0" || s === "true";
}

function productKey(name, instructor, start, weekdays) {
  return `${name}|${instructor}|${start}|${weekdays.join(",")}`;
}

function parseSummerSheet(rows) {
  const stats = { products: 0, enrollments: 0, skippedUnpaid: 0, skippedEmpty: 0 };
  const products = [];
  const enrollments = [];
  const families = new Map();
  const participants = new Map();

  const maxRow = Math.max(...rows.keys());
  let r = 1;
  while (r <= maxRow) {
    const cells = rows.get(r) || {};
    const name = normalizeName(cells[2]);
    if (!name || !name.includes("לימוד שחייה")) {
      r++;
      continue;
    }

    const courseStart = parseHebrewDate(cells[11]) || SEASON_START;
    const row2 = rows.get(r + 1) || {};
    const weekdays = parseWeekdays(row2[1] || "");
    const instructor = normalizeName(row2[2]);
    const courseEnd = parseHebrewDate(row2[11]) || SEASON_END;
    const times = parseTimeRange(rows.get(r + 2)?.[1] || "");

    const prod = {
      key: productKey(name, instructor, times.start, weekdays),
      name,
      instructor,
      startTime: times.start,
      endTime: times.end,
      weekdays,
      courseStart,
      courseEnd,
    };
    products.push(prod);
    stats.products++;

    let rr = r + 4;
    while (rows.has(rr)) {
      const sc = rows.get(rr);
      const header = normalizeName(sc[2]);
      if (header.includes("לימוד שחייה")) break;
      if (header.includes("מס' לקוח") || !sc[3]) {
        rr++;
        continue;
      }

      const childName = normalizeName(sc[3]);
      if (!childName || childName === "0") {
        stats.skippedEmpty++;
        rr++;
        continue;
      }

      if (!isPaid(sc[9])) {
        stats.skippedUnpaid++;
        rr++;
        continue;
      }

      const clientId = normalizeClientId(sc[2]);
      const phone = normalizePhone(sc[7]);
      const parent = normalizeName(sc[6]);
      const partKey = clientId || `${childName}|${phone}`;

      if (phone) families.set(phone, { phone, parentName: parent });
      participants.set(partKey, {
        key: partKey,
        phone,
        fullName: childName,
        clientId,
        gender: normalizeName(sc[5]) || null,
      });

      enrollments.push({
        productKey: prod.key,
        participantKey: partKey,
        paymentStatus: "paid",
        validFrom: courseStart,
        validUntil: courseEnd,
      });
      stats.enrollments++;
      rr++;
    }
    r = rr;
  }

  return { products, enrollments, families, participants, stats };
}

async function resetSeason() {
  const { data: season } = await supabase.from("seasons").select("id").eq("name", SEASON_NAME).maybeSingle();
  if (!season) return;
  const { data: prods } = await supabase.from("products").select("id").eq("season_id", season.id);
  const productIds = (prods || []).map((p) => p.id);
  if (productIds.length) {
    const { data: enrs } = await supabase.from("enrollments").select("id").in("product_id", productIds);
    const enrIds = (enrs || []).map((e) => e.id);
    if (enrIds.length) {
      await supabase.from("access_passes").delete().in("enrollment_id", enrIds);
      await supabase.from("enrollments").delete().in("id", enrIds);
    }
    await supabase.from("products").delete().in("id", productIds);
  }
  await supabase.from("seasons").delete().eq("id", season.id);
}

async function importToDb(data) {
  const { data: tpl } = await supabase
    .from("product_templates")
    .select("id")
    .eq("code", "summer_course")
    .single();
  if (!tpl) throw new Error("summer_course template not found");

  if (reset) await resetSeason();

  const { data: existingSeason } = await supabase.from("seasons").select("id").eq("name", SEASON_NAME).maybeSingle();
  if (existingSeason) {
    throw new Error(`Season ${SEASON_NAME} already exists. Use --reset to re-import.`);
  }

  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .insert({ name: SEASON_NAME, start_date: SEASON_START, end_date: SEASON_END, active: false })
    .select("id")
    .single();
  if (seasonErr) throw seasonErr;

  const productIdByKey = new Map();
  for (const p of data.products) {
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        season_id: season.id,
        template_id: tpl.id,
        name: p.name,
        start_time: p.startTime,
        end_time: p.endTime,
        instructor_name: p.instructor,
        schedule_pattern: {
          type: "course_series",
          weekdays: p.weekdays,
          course_start: p.courseStart,
          course_end: p.courseEnd,
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    productIdByKey.set(p.key, row.id);
    await supabase.rpc("generate_course_series_sessions", { p_product_id: row.id });
  }

  const familyIdByPhone = new Map();
  for (const fam of data.families.values()) {
    const { data: row, error } = await supabase
      .from("families")
      .insert({ phone: fam.phone, parent_name: fam.parentName })
      .select("id")
      .single();
    if (error) throw error;
    familyIdByPhone.set(fam.phone, row.id);
  }

  const participantIdByKey = new Map();
  for (const part of data.participants.values()) {
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

  for (const e of data.enrollments) {
    const productId = productIdByKey.get(e.productKey);
    const participantId = participantIdByKey.get(e.participantKey);
    if (!productId || !participantId) continue;
    const { data: enr, error } = await supabase
      .from("enrollments")
      .insert({
        product_id: productId,
        participant_id: participantId,
        payment_status: e.paymentStatus,
        valid_from: e.validFrom,
        valid_until: e.validUntil,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.rpc("generate_course_series_sessions", { p_product_id: productId });
    await supabase.rpc("regenerate_enrollment_passes", { p_enrollment_id: enr.id });
  }

  return { seasonId: season.id, stats: data.stats };
}

const sheets = loadWorkbook(resolve(xlsxPath));
const sheet = sheets[IMPORT_SHEET];
if (!sheet) {
  console.error(`Sheet "${IMPORT_SHEET}" not found. Available: ${Object.keys(sheets).join(", ")}`);
  process.exit(1);
}

const data = parseSummerSheet(sheet);

console.log("=== Summer course import report ===");
console.log(`Sheet: ${IMPORT_SHEET}`);
console.log(`Products: ${data.stats.products}`);
console.log(`Enrollments: ${data.stats.enrollments}`);
console.log(`Families: ${data.families.size}`);
console.log(`Participants: ${data.participants.size}`);
console.log(`Skipped unpaid: ${data.stats.skippedUnpaid}`);
console.log(`Skipped empty rows: ${data.stats.skippedEmpty}`);

if (data.products.length) {
  console.log("\nCourses:");
  for (const p of data.products) {
    console.log(`  - ${p.name} · ${p.instructor} · days ${p.weekdays.join(",")} · ${p.courseStart}–${p.courseEnd} · ${p.startTime.slice(0, 5)}`);
  }
}

if (dryRun) {
  console.log("\n(dry-run — no DB writes)");
  process.exit(0);
}

importToDb(data)
  .then((res) => {
    console.log(`\nImport complete. Season id: ${res.seasonId}`);
  })
  .catch((err) => {
    console.error("Import failed:", err.message || err);
    process.exit(1);
  });
