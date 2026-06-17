#!/usr/bin/env node
/**
 * Stream Line OS — ייבוא חד-פעמי של לידי מבדק מקובץ Excel
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-assessment-leads.mjs "/path/to/leads.xlsx"
 *
 * Optional flags:
 *   --dry-run   Parse only, print report, no DB writes
 *   --reset     Delete assessment_leads + related enrollments/passes for imported slots (use with care)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const DEFAULT_TIME = "16:00:00";
const DEFAULT_CAPACITY = 10;
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reset = args.includes("--reset");
const xlsxPath = args.find((a) => !a.startsWith("--"));

if (!xlsxPath) {
  console.error('Usage: node scripts/import-assessment-leads.mjs [--dry-run] [--reset] "/path/to/leads.xlsx"');
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
  const dir = mkdtempSync(join(tmpdir(), "assessment-leads-xlsx-"));
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
    const parts = [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]);
    strings.push(parts.join(""));
  }
  return strings;
}

function parseSheetRows(xml, strings) {
  const rows = [];
  const rowRe = /<row[^>]* r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = {};
    const cellRe = /<c[^>]* r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>)?/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const col = cm[1];
      let val = cm[3] || "";
      if (cm[2].includes('t="s"') && val !== "") val = strings[Number(val)] || "";
      cells[col] = val;
    }
    rows.push({ rowNum: Number(rm[1]), cells });
  }
  return rows;
}

function excelDateToIso(raw) {
  if (!raw || Number.isNaN(Number(raw))) return null;
  const d = new Date(EXCEL_EPOCH.getTime() + Number(raw) * 86400000);
  return d.toISOString().slice(0, 10);
}

function normalizePhone(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (/e\+?/i.test(s)) s = String(Math.round(Number(s)));
  s = s.replace(/\D/g, "");
  if (s.startsWith("972")) s = "0" + s.slice(3);
  if (s.length === 9 && !s.startsWith("0")) s = "0" + s;
  return s;
}

function parseAge(raw) {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 120) return null;
  return Math.round(n);
}

function parseLeadsFromXlsx(path) {
  const dir = extractXlsx(resolve(path));
  try {
    const strings = parseSharedStrings(readExtractedFile(dir, "xl/sharedStrings.xml"));
    const sheetXml = readExtractedFile(dir, "xl/worksheets/sheet1.xml");
    const rows = parseSheetRows(sheetXml, strings);
    const leads = [];

    for (const { rowNum, cells } of rows) {
      if (rowNum === 1) continue;
      const date = excelDateToIso(cells.A);
      const phone = normalizePhone(cells.F);
      if (!date || !phone) continue;

      const childName = (cells.B || "").trim();
      const parentName = (cells.E || "").trim();
      const age = parseAge(cells.C);

      leads.push({
        rowNum,
        slotDate: date,
        slotTime: DEFAULT_TIME,
        childName: childName || (parentName ? `${parentName} (מבדק)` : `מבדק שורה ${rowNum}`),
        parentName: parentName || null,
        phone,
        age,
      });
    }
    return leads;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function findOrCreateSlot(slotDate, slotTime) {
  const { data: existing } = await supabase
    .from("assessment_slots")
    .select("id, enrolled_count, capacity")
    .eq("slot_date", slotDate)
    .eq("start_time", slotTime)
    .maybeSingle();

  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("assessment_slots")
    .insert({
      slot_date: slotDate,
      start_time: slotTime,
      capacity: DEFAULT_CAPACITY,
    })
    .select("id, enrolled_count, capacity")
    .single();

  if (error) throw error;

  const { error: syncErr } = await supabase.rpc("sync_assessment_slot_session", {
    p_slot_id: inserted.id,
  });
  if (syncErr) throw syncErr;

  return inserted;
}

async function registerLead(lead, slotId) {
  const { data, error } = await supabase.rpc("register_assessment", {
    p_slot_id: slotId,
    p_child_name: lead.childName,
    p_child_age: lead.age,
    p_parent_name: lead.parentName,
    p_phone: lead.phone,
  });
  if (error) throw error;

  if (data?.result !== "ok") {
    return { ok: false, result: data?.result || "unknown" };
  }

  const { data: pass } = await supabase
    .from("access_passes")
    .select("enrollment_id")
    .eq("public_token", data.public_token)
    .maybeSingle();

  if (pass?.enrollment_id) {
    await supabase
      .from("assessment_leads")
      .update({ source: "import" })
      .eq("enrollment_id", pass.enrollment_id);
  }

  return { ok: true, publicToken: data.public_token };
}

async function main() {
  const leads = parseLeadsFromXlsx(xlsxPath);
  console.log(`Parsed ${leads.length} lead rows from ${xlsxPath}`);

  if (dryRun) {
    for (const lead of leads) {
      console.log(
        `[dry-run] row ${lead.rowNum}: ${lead.slotDate} ${lead.childName} age=${lead.age ?? "—"} phone=${lead.phone}`,
      );
    }
    return;
  }

  if (reset) {
    console.warn("--reset: deleting assessment_leads with source import/web from this import only is not implemented; skipping destructive reset");
  }

  const slotCache = new Map();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const lead of leads) {
    const slotKey = `${lead.slotDate}|${lead.slotTime}`;
    try {
      if (!slotCache.has(slotKey)) {
        slotCache.set(slotKey, await findOrCreateSlot(lead.slotDate, lead.slotTime));
      }
      const slot = slotCache.get(slotKey);

      if (slot.enrolled_count >= slot.capacity) {
        console.warn(`SKIP row ${lead.rowNum}: slot full ${lead.slotDate}`);
        skipped++;
        continue;
      }

      const result = await registerLead(lead, slot.id);
      if (!result.ok) {
        console.warn(`SKIP row ${lead.rowNum}: ${result.result}`);
        skipped++;
        continue;
      }

      slot.enrolled_count += 1;
      ok++;
      console.log(`OK row ${lead.rowNum}: ${lead.childName} → /t/${result.publicToken}`);
    } catch (e) {
      failed++;
      console.error(`FAIL row ${lead.rowNum}:`, e.message);
    }
  }

  console.log(`\nDone: ${ok} imported, ${skipped} skipped, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
