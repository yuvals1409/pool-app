#!/usr/bin/env node
/** Combine MCP execute_sql JSON outputs into data/import/db-snapshot.json */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function parseMcpFile(path) {
  const raw = readFileSync(path, "utf8").trim();
  let outer;
  try {
    outer = JSON.parse(raw);
  } catch {
    throw new Error(`Not JSON: ${path}`);
  }
  const resultStr = typeof outer.result === "string" ? outer.result : JSON.stringify(outer.result);
  const match = resultStr.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in result: ${path}`);
  return JSON.parse(match[0])[0];
}

const dir = process.argv[2] || "data/import/mcp-raw";
const products = parseMcpFile(resolve(dir, "products.json"));
const participants = parseMcpFile(resolve(dir, "participants.json"));
const enrollments = parseMcpFile(resolve(dir, "enrollments.json"));

mkdirSync("data/import", { recursive: true });
const snapshot = {
  season_id: products.season_id,
  products: products.products,
  participants: participants.participants,
  enrollments: enrollments.enrollments,
};
writeFileSync("data/import/db-snapshot.json", JSON.stringify(snapshot, null, 2));
console.log(
  "snapshot:",
  snapshot.products?.length,
  "products,",
  snapshot.participants?.length,
  "participants,",
  snapshot.enrollments?.length,
  "enrollments",
);
