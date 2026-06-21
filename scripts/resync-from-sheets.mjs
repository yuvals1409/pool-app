#!/usr/bin/env node
/**
 * Full reconcile from group spreadsheets (annual + summer).
 *
 * Usage:
 *   node scripts/resync-from-sheets.mjs --annual "/path/to/annual.xlsx" [--dry-run]
 *   node scripts/resync-from-sheets.mjs --summer "/path/to/summer.xlsx" [--dry-run]
 *   node scripts/resync-from-sheets.mjs --both --annual "..." --summer "..."
 *   node scripts/resync-from-sheets.mjs --annual "..." --season 2026/27 [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadWorkbook } from "./lib/xlsx-workbook.mjs";
import { normalizeName, normalizePhone, normalizeSheetGender } from "./lib/sheet-normalize.mjs";
import {
  parseAnnualData,
  ANNUAL_SEASON_NAME,
  configureAnnualSeason,
  getAnnualSeasonConfig,
  productKey as annualProductKey,
  DAY_MAP,
  matchProductFromPlacement,
} from "./lib/parse-annual-sheet.mjs";
import {
  parseSummerData,
  parseSummerPriceList,
  SUMMER_SEASON_NAME,
  SUMMER_SEASON_START,
  SUMMER_SEASON_END,
} from "./lib/parse-summer-sheet.mjs";

const DAY_NUM_TO_NAME = Object.fromEntries(Object.entries(DAY_MAP).map(([k, v]) => [v, k]));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const parseOnly = args.includes("--parse-only");
const doAnnual = args.includes("--annual") || args.includes("--both");
const doSummer = args.includes("--summer") || args.includes("--both");
const annualPath = args.includes("--annual") ? args[args.indexOf("--annual") + 1] : null;
const summerPath = args.includes("--summer") ? args[args.indexOf("--summer") + 1] : null;
const seasonArg = args.includes("--season") ? args[args.indexOf("--season") + 1] : null;
if (seasonArg) configureAnnualSeason(seasonArg);

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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const readKey = serviceKey || process.env.VITE_SUPABASE_ANON_KEY;

if (!parseOnly && !dryRun && (!supabaseUrl || !serviceKey)) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!parseOnly && (!supabaseUrl || !readKey)) {
  console.error("Missing SUPABASE_URL / VITE_SUPABASE_URL and API key");
  process.exit(1);
}

const supabase = parseOnly
  ? null
  : createClient(supabaseUrl, readKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

const report = {
  participants_updated: 0,
  participants_created: 0,
  enrollments_updated: 0,
  enrollments_created: 0,
  enrollments_cancelled: 0,
  gender_skipped_manual: 0,
  unmatched_products: [],
  unmatched_participants: [],
  conflicts: [],
};

function dbAnnualKey(p) {
  const day = DAY_NUM_TO_NAME[p.day_of_week] || "";
  const start = String(p.start_time).slice(0, 8);
  const end = String(p.end_time).slice(0, 8);
  return annualProductKey(day, p.instructor_name, start, end, p.name);
}

function dbSummerKey(p) {
  const wd = p.schedule_pattern?.weekdays?.join(",") || "";
  return `${p.name}|${p.instructor_name}|${String(p.start_time).slice(0, 8)}|${wd}`;
}

async function ensureFamily(phone, parentName) {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const { data: existing } = await supabase.from("families").select("id").eq("phone", norm).maybeSingle();
  if (existing) {
    if (parentName) {
      await supabase.from("families").update({ parent_name: parentName }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: row, error } = await supabase
    .from("families")
    .insert({ phone: norm, parent_name: parentName || null })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

async function findParticipant({ clientId, fullName, phone }) {
  if (clientId) {
    const { data } = await supabase
      .from("participants")
      .select("id, gender, gender_manual_at, family_id, full_name, external_client_id")
      .eq("external_client_id", clientId)
      .maybeSingle();
    if (data) return data;
  }
  const normPhone = normalizePhone(phone);
  if (normPhone && fullName) {
    const { data: fam } = await supabase.from("families").select("id").eq("phone", normPhone).maybeSingle();
    if (fam) {
      const { data: parts } = await supabase
        .from("participants")
        .select("id, gender, gender_manual_at, family_id, full_name, external_client_id")
        .eq("family_id", fam.id);
      const match = (parts || []).find(
        (p) => normalizeName(p.full_name).toLowerCase() === normalizeName(fullName).toLowerCase(),
      );
      if (match) return match;
    }
  }
  return null;
}

async function upsertParticipant(part, familyId) {
  const existing = await findParticipant(part);
  const gender = normalizeSheetGender(part.gender) || part.gender;

  if (existing) {
    const patch = {};
    if (!existing.external_client_id && part.clientId) {
      patch.external_client_id = part.clientId;
    }
    if (gender && !existing.gender_manual_at) patch.gender = gender;
    else if (gender && existing.gender_manual_at) report.gender_skipped_manual += 1;
    if (part.birthDate) patch.birth_date = part.birthDate;
    if (Object.keys(patch).length) {
      if (!dryRun) {
        await supabase.from("participants").update(patch).eq("id", existing.id);
      }
      report.participants_updated += 1;
    }
    return existing.id;
  }

  if (!familyId) {
    report.unmatched_participants.push(part.fullName || part.key);
    return null;
  }

  if (!dryRun) {
    const { data: row, error } = await supabase
      .from("participants")
      .insert({
        family_id: familyId,
        full_name: part.fullName,
        gender,
        birth_date: part.birthDate || null,
        external_client_id: part.clientId || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    report.participants_created += 1;
    return row.id;
  }
  report.participants_created += 1;
  return "dry-run-participant";
}

async function reconcileEnrollment({
  participantId,
  productId,
  paymentStatus,
  validFrom,
  validUntil,
  notes,
  seasonProductIds,
}) {
  const { data: activeRows } = await supabase
    .from("enrollments")
    .select("id, product_id, active")
    .eq("participant_id", participantId)
    .eq("active", true);

  const same = (activeRows || []).find((e) => e.product_id === productId);
  if (same) {
    if (!dryRun) {
      await supabase.from("enrollments").update({
        payment_status: paymentStatus,
        valid_from: validFrom,
        valid_until: validUntil,
        notes: notes ?? undefined,
      }).eq("id", same.id);
    }
    report.enrollments_updated += 1;
    return;
  }

  const wrongSeason = (activeRows || []).filter(
    (e) => seasonProductIds.has(e.product_id) && e.product_id !== productId,
  );
  for (const e of wrongSeason) {
    if (!dryRun) {
      await supabase.from("enrollments").update({
        active: false,
        cancelled_at: new Date().toISOString(),
      }).eq("id", e.id);
    }
    report.enrollments_cancelled += 1;
  }

  if (!dryRun) {
    const { error } = await supabase.from("enrollments").insert({
      product_id: productId,
      participant_id: participantId,
      payment_status: paymentStatus,
      valid_from: validFrom,
      valid_until: validUntil,
      active: true,
      notes: notes || null,
    });
    if (error?.code === "23505") {
      await supabase.from("enrollments").update({
        active: true,
        payment_status: paymentStatus,
        valid_from: validFrom,
        valid_until: validUntil,
        cancelled_at: null,
      }).eq("participant_id", participantId).eq("product_id", productId);
    } else if (error) {
      throw error;
    }
  }
  report.enrollments_created += 1;
}

async function resyncAnnual(xlsxPath) {
  console.log(`\n=== Annual resync: ${xlsxPath} ===`);
  const sheets = loadWorkbook(resolve(xlsxPath));
  const data = parseAnnualData(sheets);

  const annualSeason = getAnnualSeasonConfig();

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("name", annualSeason.name)
    .maybeSingle();
  if (!season) throw new Error(`Season ${annualSeason.name} not found in DB`);

  const { data: dbProducts } = await supabase
    .from("products")
    .select("id, name, day_of_week, start_time, end_time, instructor_name")
    .eq("season_id", season.id);

  const productIdByKey = new Map();
  for (const p of dbProducts || []) {
    productIdByKey.set(dbAnnualKey(p), p.id);
  }
  const seasonProductIds = new Set((dbProducts || []).map((p) => p.id));

  for (const sp of data.products) {
    if (!productIdByKey.has(sp.key)) {
      report.unmatched_products.push(sp.key);
    }
  }

  for (const fam of data.families.values()) {
    await ensureFamily(fam.phone, fam.parentName);
  }

  for (const enr of data.enrollments) {
    const part = data.participants.get(enr.participantKey);
    if (!part) continue;
    const familyId = await ensureFamily(part.phone, part.parentName);
    const participantId = await upsertParticipant(part, familyId);
    if (!participantId) continue;

    const productId = productIdByKey.get(enr.productKey);
    if (!productId) continue;

    await reconcileEnrollment({
      participantId,
      productId,
      paymentStatus: enr.paymentStatus,
      validFrom: enr.validFrom,
      validUntil: enr.validUntil,
      notes: enr.notes,
      seasonProductIds,
    });
  }

  for (const c of data.cancellations) {
    const part = await findParticipant(c);
    if (!part) continue;
    const matched = matchProductFromPlacement(c.placement, data.products);
    const productId = matched ? productIdByKey.get(matched.key) : null;
    if (!dryRun) {
      let q = supabase.from("enrollments").update({
        active: false,
        cancelled_at: new Date().toISOString(),
      }).eq("participant_id", part.id);
      if (productId) q = q.eq("product_id", productId);
      await q;
    }
    report.enrollments_cancelled += 1;
  }

  if (!dryRun) {
    await supabase.from("sheet_sync_runs").insert({
      direction: "pull",
      sheet_tab: "annual_resync",
      status: "ok",
      rows_in: data.stats.enrollments,
      finished_at: new Date().toISOString(),
    });
  }
}

async function importSummerSeason(data) {
  const { data: tpl } = await supabase
    .from("product_templates")
    .select("id")
    .eq("code", "summer_course")
    .single();
  if (!tpl) throw new Error("summer_course template missing");

  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .insert({
      name: SUMMER_SEASON_NAME,
      start_date: SUMMER_SEASON_START,
      end_date: SUMMER_SEASON_END,
      active: false,
    })
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
  return { seasonId: season.id, productIdByKey };
}

async function resyncSummer(xlsxPath) {
  console.log(`\n=== Summer resync: ${xlsxPath} ===`);
  const sheets = loadWorkbook(resolve(xlsxPath));
  const data = parseSummerData(sheets);
  const prices = parseSummerPriceList(sheets["מחירון"]);

  let season = (await supabase.from("seasons").select("id").eq("name", SUMMER_SEASON_NAME).maybeSingle()).data;
  let productIdByKey = new Map();

  if (!season) {
    if (dryRun) {
      console.log("Summer season missing — would create on real run");
      return;
    }
    const imp = await importSummerSeason(data);
    season = { id: imp.seasonId };
    productIdByKey = imp.productIdByKey;
  } else {
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id, name, start_time, end_time, instructor_name, schedule_pattern")
      .eq("season_id", season.id);
    for (const p of dbProducts || []) {
      productIdByKey.set(dbSummerKey(p), p.id);
    }
    for (const [name, price] of prices) {
      const match = (dbProducts || []).find((p) => p.name.includes(name) || name.includes(p.name));
      if (match) {
        await supabase.from("products").update({ price }).eq("id", match.id);
      }
    }
  }

  const seasonProductIds = new Set([...productIdByKey.values()]);

  for (const fam of data.families.values()) {
    await ensureFamily(fam.phone, fam.parentName);
  }

  for (const enr of data.enrollments) {
    const part = data.participants.get(enr.participantKey);
    if (!part) continue;
    const familyId = await ensureFamily(part.phone, part.parentName);
    const participantId = await upsertParticipant(part, familyId);
    if (!participantId) continue;

    const productId = productIdByKey.get(enr.productKey);
    if (!productId) {
      report.unmatched_products.push(enr.productKey);
      continue;
    }

    await reconcileEnrollment({
      participantId,
      productId,
      paymentStatus: enr.paymentStatus,
      validFrom: enr.validFrom,
      validUntil: enr.validUntil,
      seasonProductIds,
    });
  }

  if (!dryRun) {
    await supabase.from("sheet_sync_runs").insert({
      direction: "pull",
      sheet_tab: "summer_resync",
      status: "ok",
      rows_in: data.stats.enrollments,
      finished_at: new Date().toISOString(),
    });
  }
}

function printReport() {
  console.log("\n=== Resync report ===");
  for (const [k, v] of Object.entries(report)) {
    if (Array.isArray(v)) {
      console.log(`${k}: ${v.length}`);
      if (v.length && v.length <= 10) console.log("  ", v.join("; "));
    } else {
      console.log(`${k}: ${v}`);
    }
  }
}

async function main() {
  if (!doAnnual && !doSummer) {
    console.error("Specify --annual PATH, --summer PATH, or --both");
    process.exit(1);
  }
  if (doAnnual && !annualPath) {
    console.error("--annual requires file path");
    process.exit(1);
  }
  if (doSummer && !summerPath) {
    console.error("--summer requires file path");
    process.exit(1);
  }

  if (parseOnly) {
    if (doAnnual) {
      const data = parseAnnualData(loadWorkbook(resolve(annualPath)));
      console.log("Annual parse:", data.stats, "cancellations:", data.cancellations.length);
    }
    if (doSummer) {
      const sheets = loadWorkbook(resolve(summerPath));
      const data = parseSummerData(sheets);
      console.log("Summer parse:", data.stats, "prices:", parseSummerPriceList(sheets["מחירון"]).size);
    }
    return;
  }

  if (dryRun) console.log("(dry-run mode — no DB writes)");

  if (doAnnual) await resyncAnnual(annualPath);
  if (doSummer) await resyncSummer(summerPath);
  printReport();
}

main().catch((err) => {
  console.error("Resync failed:", err.message || err);
  process.exit(1);
});
