#!/usr/bin/env node
/**
 * Apply SQL migration files using DATABASE_URL or Supabase direct connection.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

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

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL;

if (!dbUrl) {
  console.error("Missing DATABASE_URL / SUPABASE_DB_URL in environment");
  process.exit(1);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/apply-sql-files.mjs <file.sql>...");
  process.exit(1);
}

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(resolve(file), "utf8");
    console.log(`Applying ${file} (${sql.length} bytes)...`);
    await client.query(sql);
    console.log(`OK: ${file}`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  await client.end();
}
