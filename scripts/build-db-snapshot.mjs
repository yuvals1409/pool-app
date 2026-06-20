#!/usr/bin/env node
/** Build data/import/db-snapshot.json from Supabase MCP query results pasted as JSON files. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve("data/import/db-snapshot.json");

function parseMcpFile(path) {
  const raw = readFileSync(path, "utf8");
  const outer = JSON.parse(raw);
  const inner = JSON.parse(outer.result);
  return inner[0];
}

const productsData = parseMcpFile(
  "/Users/yuvalsacagiu/.cursor/projects/Users-yuvalsacagiu-Downloads-pool-app-cursor/agent-tools/products-query.json",
);
const participantsData = parseMcpFile(
  "/Users/yuvalsacagiu/.cursor/projects/Users-yuvalsacagiu-Downloads-pool-app-cursor/agent-tools/efb3ddfc-3417-4a45-bacc-ba87d283cbb8.txt",
);
const enrollmentsData = parseMcpFile(
  "/Users/yuvalsacagiu/.cursor/projects/Users-yuvalsacagiu-Downloads-pool-app-cursor/agent-tools/7e96acc3-5aee-47a1-86e1-d5e5c58ac728.txt",
);

mkdirSync(resolve("data/import"), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      season_id: productsData.season_id,
      products: productsData.products,
      participants: participantsData.participants,
      enrollments: enrollmentsData.enrollments,
    },
    null,
    2,
  ),
);
console.log("Wrote", outPath);
