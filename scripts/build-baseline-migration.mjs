#!/usr/bin/env node
/**
 * Build a single baseline migration from legacy SQL files (setup + ordered migrations).
 * Run after archiving root supabase_migration_*.sql files.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const archiveDir = resolve(root, "supabase/migrations/archive");
const legacySetup = resolve(root, "supabase/legacy/supabase_setup.sql");
const outFile = resolve(root, "supabase/migrations/20260630120000_baseline.sql");

const MIGRATION_ORDER = [
  "supabase_migration_stream_line_os.sql",
  "supabase_migration_stream_line_os_stage2.sql",
  "supabase_migration_stream_line_os_stage3.sql",
  "supabase_migration_stream_line_os_stage4.sql",
  "supabase_migration_stream_line_os_stage5_attendance.sql",
  "supabase_migration_stream_line_os_stage6.sql",
  "supabase_migration_group_model_v2.sql",
  "supabase_migration_recurring_lessons.sql",
  "supabase_migration_lessons_instructor_id.sql",
  "supabase_migration_lesson_manage.sql",
  "supabase_migration_season_planning.sql",
  "supabase_migration_season_planning_v2.sql",
  "supabase_migration_merge_swimming_seasons.sql",
  "supabase_migration_child_portal.sql",
  "supabase_migration_leads_crm.sql",
  "supabase_migration_price_list.sql",
  "supabase_migration_waitlist.sql",
  "supabase_migration_utilization_makeup.sql",
  "supabase_migration_instructor_payroll.sql",
  "supabase_migration_session_revenue.sql",
  "supabase_migration_session_instructor_overrides.sql",
  "supabase_migration_analytics_v2.sql",
  "supabase_migration_command_center_foundation.sql",
  "supabase_migration_command_center_sheets.sql",
  "supabase_migration_command_center_analytics.sql",
  "supabase_migration_command_center_alerts_extend.sql",
  "supabase_migration_command_center_operations_extend.sql",
  "supabase_migration_command_center_perf_indexes.sql",
  "supabase_migration_fix_revenue_by_season.sql",
  "supabase_migration_fix_occupancy_trend.sql",
  "supabase_migration_fix_list_due_lead_tasks.sql",
  "supabase_migration_stream_line_cron.sql",
];

function read(path) {
  return readFileSync(path, "utf8");
}

const parts = [
  "-- ============================================================",
  "--  BASELINE MIGRATION — Stream Line (pool-app)",
  "--  Generated from supabase/legacy/supabase_setup.sql + archive/",
  "--  For fresh environments: supabase db reset",
  "--  Production (already migrated): see supabase/README.md",
  "-- ============================================================",
  "",
  read(legacySetup),
  "",
];

for (const name of MIGRATION_ORDER) {
  const path = resolve(archiveDir, name);
  parts.push(`-- ── ${name} ──`, "", read(path), "");
}

mkdirSync(resolve(root, "supabase/migrations"), { recursive: true });
writeFileSync(outFile, parts.join("\n"), "utf8");
console.log(`Wrote ${outFile} (${parts.join("\n").length} bytes)`);
