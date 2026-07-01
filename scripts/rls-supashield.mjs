#!/usr/bin/env node
/**
 * Run SupaShield RLS tests against domain scenarios in supabase/rls-scenarios.json.
 *
 * Usage:
 *   node scripts/rls-supashield.mjs
 *   node scripts/rls-supashield.mjs --audit
 *   node scripts/rls-supashield.mjs --coverage
 *
 * Requires:
 *   - DATABASE_URL or SUPASHIELD_DATABASE_URL (local: `supabase status -o env`)
 *   - Demo users seeded: npm run seed:demo
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCENARIOS_PATH = resolve(ROOT, "supabase/rls-scenarios.json");
const POLICY_DIR = resolve(ROOT, ".supashield");
const POLICY_PATH = resolve(POLICY_DIR, "policy.yaml");

const args = process.argv.slice(2);
const auditMode = args.includes("--audit");
const coverageMode = args.includes("--coverage");
const jsonMode = args.includes("--json") || process.env.CI === "true";

loadEnv();

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    [
      "DATABASE_URL is not set.",
      "",
      "Local Supabase:",
      "  supabase start",
      "  supabase db reset",
      "  eval \"$(supabase status -o env)\"   # exports DB_URL",
      "  export DATABASE_URL=\"$DB_URL\"",
      "",
      "Then seed demo users:",
      "  npm run seed:demo",
      "",
      "Remote/staging only (never production):",
      "  DATABASE_URL=postgresql://... npm run db:rls",
    ].join("\n"),
  );
  process.exit(1);
}

if (!process.env.CI && databaseUrl.includes("127.0.0.1")) {
  ensureLocalStack();
}

const supashieldBin = resolve(ROOT, "node_modules/supashield/dist/cli.js");

if (auditMode) {
  runSupashield(["audit"]);
  process.exit(0);
}

if (coverageMode) {
  runSupashield(["coverage", ...(jsonMode ? ["--json"] : [])]);
  process.exit(0);
}

const scenariosConfig = JSON.parse(readFileSync(SCENARIOS_PATH, "utf8"));
const userIdsByEmail = await fetchDemoUserIds(scenariosConfig.scenarios);
const policyYaml = buildPolicyYaml(scenariosConfig, userIdsByEmail);

mkdirSync(POLICY_DIR, { recursive: true });
writeFileSync(POLICY_PATH, policyYaml, "utf8");

console.log(`Wrote ${policyYaml.split("\n").length} lines to .supashield/policy.yaml`);
console.log(`Testing ${scenariosConfig.scenarios.length} domain scenarios on ${Object.keys(groupScenariosByTable(scenariosConfig.scenarios)).length} tables...\n`);

const testArgs = ["test", "--quiet", "--parallel", "4"];
if (jsonMode) testArgs.push("--json");

const status = runSupashield(testArgs);
process.exit(status ?? 1);

function loadEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function resolveDatabaseUrl() {
  return (
    cleanEnv(process.env.SUPASHIELD_DATABASE_URL)
    || cleanEnv(process.env.DATABASE_URL)
    || cleanEnv(process.env.POSTGRES_URL)
  );
}

function resolveSupabaseCmd() {
  const direct = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (direct.status === 0) return ["supabase"];

  const viaNpx = spawnSync("npx", ["supabase", "--version"], { encoding: "utf8" });
  if (viaNpx.status === 0) return ["npx", "supabase"];

  return null;
}

function ensureLocalStack() {
  const cmd = resolveSupabaseCmd();
  if (!cmd) return;

  const status = spawnSync(cmd[0], [...cmd.slice(1), "status"], { encoding: "utf8" });
  if (status.status !== 0) {
    console.error(
      [
        "Local Supabase does not appear to be running.",
        "Start it with:",
        "  supabase start",
        "  supabase db reset",
        "  npm run seed:demo",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function runSupashield(extraArgs) {
  const result = spawnSync(process.execPath, [supashieldBin, ...extraArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      SUPASHIELD_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
    },
  });
  return result.status;
}

async function fetchDemoUserIds(scenarios) {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceKey) {
    console.error(
      [
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to resolve demo user IDs.",
        "Run: npm run seed:demo",
      ].join("\n"),
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const uniqueEmails = [
    ...new Set(scenarios.map((s) => s.email).filter(Boolean).map((e) => e.toLowerCase())),
  ];

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error(`Failed to list auth users: ${error.message}`);
    process.exit(1);
  }

  const map = {};
  for (const email of uniqueEmails) {
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      console.error(
        [
          `Demo user not found: ${email}`,
          "Run: supabase db reset && npm run seed:demo",
        ].join("\n"),
      );
      process.exit(1);
    }
    map[email] = user.id;
  }

  return map;
}

function groupScenariosByTable(scenarios) {
  const tables = {};
  for (const scenario of scenarios) {
    const key = `public.${scenario.table}`;
    if (!tables[key]) tables[key] = [];
    tables[key].push(scenario);
  }
  return tables;
}

function buildPolicyYaml(config, userIdsByEmail) {
  const grouped = groupScenariosByTable(config.scenarios);
  const lines = [
    "# Generated by scripts/rls-supashield.mjs — do not edit manually",
    "# Source: supabase/rls-scenarios.json",
    "tables:",
  ];

  for (const tableKey of Object.keys(grouped).sort()) {
    lines.push(`  ${tableKey}:`);
    lines.push("    test_scenarios:");

    for (const scenario of grouped[tableKey]) {
      const jwtClaims = buildJwtClaims(scenario, userIdsByEmail);
      lines.push(`      - name: ${scenario.id}`);
      lines.push("        jwt_claims:");
      for (const [claimKey, claimValue] of Object.entries(jwtClaims)) {
        if (typeof claimValue === "object" && claimValue !== null) {
          lines.push(`          ${claimKey}: ${JSON.stringify(claimValue)}`);
        } else {
          lines.push(`          ${claimKey}: ${JSON.stringify(claimValue)}`);
        }
      }
      lines.push("        expected:");
      for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const value = scenario.expected[op] ?? "DENY";
        lines.push(`          ${op}: ${value}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildJwtClaims(scenario, userIdsByEmail) {
  if (scenario.role === "anon") {
    return { role: "anon" };
  }

  const userId = userIdsByEmail[scenario.email.toLowerCase()];
  return {
    sub: userId,
    role: "authenticated",
    email: scenario.email,
  };
}
