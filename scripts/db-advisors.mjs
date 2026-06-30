#!/usr/bin/env node
/**
 * Run Supabase database advisors (local or linked remote).
 *
 * Usage:
 *   node scripts/db-advisors.mjs              # local, all checks
 *   node scripts/db-advisors.mjs --type security
 *   node scripts/db-advisors.mjs --linked     # remote linked project
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const linked = args.includes("--linked");
const filteredArgs = args.filter((a) => a !== "--linked");

function resolveSupabaseCmd() {
  const direct = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (direct.status === 0) return ["supabase"];

  const viaNpx = spawnSync("npx", ["supabase", "--version"], { encoding: "utf8" });
  if (viaNpx.status === 0) return ["npx", "supabase"];

  console.error(
    [
      "Supabase CLI not found.",
      "Install: brew install supabase/tap/supabase",
      "Or run once: npx supabase --version",
    ].join("\n"),
  );
  process.exit(1);
}

function ensureLocalStack() {
  const cmd = resolveSupabaseCmd();
  const status = spawnSync(cmd[0], [...cmd.slice(1), "status"], {
    encoding: "utf8",
  });

  if (status.status !== 0) {
    console.error(
      [
        "Local Supabase is not running.",
        "Start it with:",
        "  supabase start",
        "  supabase db reset",
        "Then rerun:",
        "  npm run db:advisors",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function ensureLinked() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error(
      [
        "SUPABASE_ACCESS_TOKEN is not set.",
        "Run: supabase login",
        "Or export a token from Supabase Dashboard → Account → Access Tokens",
      ].join("\n"),
    );
    process.exit(1);
  }
}

const cmd = resolveSupabaseCmd();
const advisorArgs = [
  ...cmd.slice(1),
  "db",
  "advisors",
  ...(linked ? ["--linked"] : ["--local"]),
  "--fail-on",
  "error",
  ...filteredArgs,
];

if (linked) {
  ensureLinked();
} else {
  ensureLocalStack();
}

const result = spawnSync(cmd[0], advisorArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
