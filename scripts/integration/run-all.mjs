#!/usr/bin/env node
/**
 * Run full integration suite: sync harness + CLI matrix.
 * Usage: node scripts/integration/run-all.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runScript(name) {
  console.log(`\n========== ${name} ==========\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runScript("run-skill-sync-tests.mjs");
runScript("run-cli-matrix.mjs");
console.log("\nAll integration phases passed.");
