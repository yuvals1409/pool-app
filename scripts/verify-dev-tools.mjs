#!/usr/bin/env node
/**
 * Verify local dev CLIs required by SETUP.md.
 * Usage: node scripts/verify-dev-tools.mjs
 */

import { spawnSync } from "node:child_process";

const tools = [
  {
    name: "Supabase CLI",
    commands: [["supabase", ["--version"]], ["npx", ["supabase", "--version"]]],
    install: "brew install supabase/tap/supabase",
    login: "supabase login && supabase link --project-ref <ref>",
  },
  {
    name: "GitHub CLI",
    commands: [["gh", ["--version"]]],
    install: "brew install gh",
    login: "gh auth login",
  },
];

let ok = 0;
let missing = 0;

for (const tool of tools) {
  const found = tool.commands.some(([bin, args]) => spawnSync(bin, args, { encoding: "utf8" }).status === 0);
  if (found) {
    console.log(`OK  ${tool.name}`);
    ok += 1;
  } else {
    console.log(`MISSING  ${tool.name}`);
    console.log(`  install: ${tool.install}`);
    console.log(`  setup:   ${tool.login}`);
    missing += 1;
  }
}

console.log(`\n${ok} ready, ${missing} missing`);
process.exit(missing > 0 ? 1 : 0);
