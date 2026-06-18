#!/usr/bin/env node
/**
 * סנכרון דו-כיווני עם גיליונות מאי/יוני/יולי (xlsx גיבוי)
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-monthly-sheets.mjs --push --out ./sheet-export
 *   node scripts/sync-monthly-sheets.mjs --pull "/path/to/workbook.xlsx" [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const MONTHLY_TABS = ["מאי", "יוני", "יולי"];
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pull = args.includes("--pull");
const push = args.includes("--push");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : "./sheet-export";
const xlsxPath = args.find((a) => !a.startsWith("--") && a.endsWith(".xlsx"));

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

if (!dryRun && (!supabaseUrl || !serviceKey)) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = !dryRun
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function csvEscape(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function exportTab(tab) {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(`
      id, payment_status,
      participant:participants(full_name, external_client_id, family:families(phone)),
      product:products(name)
    `)
    .eq("active", true);

  const lines = [
    ["טלפון הורה", "שם ילד", "מזהה לקוח", "חוג", "שולם", "נוכחות", "מבדק"].join(","),
  ];

  for (const e of enrollments || []) {
    lines.push([
      csvEscape(e.participant?.family?.phone),
      csvEscape(e.participant?.full_name),
      csvEscape(e.participant?.external_client_id),
      csvEscape(e.product?.name),
      csvEscape(e.payment_status === "paid" ? "שולם" : e.payment_status === "waived" ? "פטור" : "לא שולם"),
      csvEscape(""),
      csvEscape(""),
    ].join(","));
  }

  mkdirSync(resolve(outDir), { recursive: true });
  const path = join(resolve(outDir), `${tab}.csv`);
  writeFileSync(path, "\uFEFF" + lines.join("\n"), "utf8");
  console.log(`Exported ${(enrollments || []).length} rows to ${path}`);
}

async function importTab(tab, rows) {
  if (!rows?.length) return { in: 0, errors: [] };
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const childIdx = header.findIndex((h) => h.includes("ילד") || h.includes("שם"));
  const paidIdx = header.findIndex((h) => h.includes("שולם") || h.includes("paid"));
  let count = 0;
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const childName = childIdx >= 0 ? String(row[childIdx] || "").trim() : "";
    if (!childName) continue;
    if (paidIdx >= 0) {
      const paidVal = String(row[paidIdx] || "").trim();
      const status = /^(1|כן|שולם|paid|true)$/i.test(paidVal) ? "paid"
        : /פטור|waived/i.test(paidVal) ? "waived" : "unpaid";
      if (!dryRun) {
        const { data: part } = await supabase
          .from("participants")
          .select("id, enrollments(id, active)")
          .eq("full_name", childName)
          .maybeSingle();
        const enrId = part?.enrollments?.find((x) => x.active)?.id;
        if (enrId) {
          const { error } = await supabase.from("enrollments").update({ payment_status: status }).eq("id", enrId);
          if (error) errors.push(error.message);
          else count++;
        }
      } else {
        count++;
      }
    }
  }

  if (!dryRun) {
    await supabase.from("sheet_sync_runs").insert({
      direction: "pull",
      sheet_tab: tab,
      rows_in: count,
      rows_out: 0,
      errors,
      status: errors.length ? "partial" : "ok",
      finished_at: new Date().toISOString(),
    });
  }

  return { in: count, errors };
}

async function main() {
  if (push) {
    if (dryRun) {
      console.log("Dry run: would export tabs", MONTHLY_TABS.join(", "), "to", resolve(outDir));
      return;
    }
    for (const tab of MONTHLY_TABS) {
      await exportTab(tab);
    }
    return;
  }

  if (pull && xlsxPath) {
    console.log("Pull from xlsx requires tab sheets named:", MONTHLY_TABS.join(", "));
    console.log("For full xlsx parsing, use the same workbook structure as import-annual-season.mjs");
    console.log("Alternatively export CSV per tab from Google Sheets and place in", outDir);
    for (const tab of MONTHLY_TABS) {
      const csvPath = join(resolve(outDir), `${tab}.csv`);
      if (!existsSync(csvPath)) {
        console.warn(`Skip ${tab}: ${csvPath} not found`);
        continue;
      }
      const rows = readFileSync(csvPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')));
      const result = await importTab(tab, rows);
      console.log(`${tab}: updated ${result.in} rows`);
    }
    return;
  }

  console.error(`Usage:
  node scripts/sync-monthly-sheets.mjs --push --out ./sheet-export
  node scripts/sync-monthly-sheets.mjs --pull --out ./sheet-export`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
