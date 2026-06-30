#!/usr/bin/env node
/**
 * Validate Supabase CI secrets without printing key material.
 * Usage: node scripts/verify-supabase-ci.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnv();

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const urlRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

let payload;
try {
  const body = serviceKey.split(".")[1];
  payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
} catch {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not a valid JWT");
  process.exit(1);
}

console.log(`Supabase URL ref: ${urlRef ?? "unknown"}`);
console.log(`Service key role: ${payload.role ?? "unknown"}`);
console.log(`Service key ref: ${payload.ref ?? "unknown"}`);

if (payload.role !== "service_role") {
  console.error(
    "Wrong key type — paste the service_role key from Supabase → Settings → API (not anon).",
  );
  process.exit(1);
}

if (urlRef && payload.ref && urlRef !== payload.ref) {
  console.error("Key project ref does not match VITE_SUPABASE_URL — keys are from different projects.");
  process.exit(1);
}

console.log("Supabase CI secrets look valid.");
