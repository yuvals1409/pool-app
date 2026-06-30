#!/usr/bin/env node
/**
 * Create or refresh Stream Line demo accounts (guard, instructor, admin, office).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-users.mjs
 *
 * Requires Email auth enabled in Supabase Dashboard → Authentication → Providers → Email.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEMO_PASSWORD, DEMO_USERS } from "../src/lib/demoUsers.js";

loadEnv();

const supabaseUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  console.error(`  SUPABASE_URL/VITE_SUPABASE_URL: ${supabaseUrl ? "set" : "MISSING"}`);
  console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? "set" : "MISSING"}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function findUserIdByEmail(email) {
  const normalized = email.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertDemoUser(demoUser) {
  const email = demoUser.email.toLowerCase();
  let userId = await findUserIdByEmail(email);

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: demoUser.full_name },
    });
    if (error) throw error;
    console.log(`↻ updated auth user: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: demoUser.full_name },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ created auth user: ${email}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email,
    full_name: demoUser.full_name,
    role: demoUser.role,
    status: "approved",
  }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { error: assignmentError } = await supabase.from("role_assignments").upsert({
    email,
    role: demoUser.role,
  }, { onConflict: "email" });
  if (assignmentError) throw assignmentError;

  console.log(`  role=${demoUser.role} status=approved`);
}

async function main() {
  const { error: pingError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (pingError) {
    console.error("Supabase service role check failed:", pingError.message);
    console.error("Verify SUPABASE_SERVICE_ROLE_KEY matches the project in VITE_SUPABASE_URL.");
    process.exit(1);
  }

  console.log("Seeding demo users...");
  console.log(`Password for all accounts: ${DEMO_PASSWORD}\n`);

  for (const demoUser of DEMO_USERS) {
    await upsertDemoUser(demoUser);
  }

  console.log("\nDone. Demo accounts:");
  for (const demoUser of DEMO_USERS) {
    console.log(`  ${demoUser.role.padEnd(11)} ${demoUser.email}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
