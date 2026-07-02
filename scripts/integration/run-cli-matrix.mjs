#!/usr/bin/env node
/**
 * CLI command matrix against hosted backend.
 * Expects .harness-state.json from run-skill-sync-tests.mjs (or env overrides).
 * Usage: node scripts/integration/run-cli-matrix.mjs
 */
import fs from "node:fs";
import {
  CLI,
  createRunner,
  loadApiKey,
  readHarnessState,
} from "./lib/harness.mjs";

const state = readHarnessState();
const skillId = process.env.HARNESS_SKILL_ID ?? state.skillId;
const skillRel = process.env.HARNESS_SKILL_REL ?? state.skillRel;
const workspace = process.env.HARNESS_WORKSPACE ?? state.workspace;

if (!skillId || !skillRel) {
  console.error("Missing skillId/skillRel in harness state");
  process.exit(1);
}

const { run, runKnownBlocker, summary } = createRunner(loadApiKey());

console.log(`CLI matrix · skill=${skillId.slice(0, 8)}…\n`);

run("CLI health", "node", [CLI, "health", "--json"], { cwd: workspace });
run("CLI version list", "node", [CLI, "version", "list", "--skill", skillRel, "--json"], { cwd: workspace });
run("CLI test list", "node", [CLI, "test", "list", "--skill", skillRel, "--json"], { cwd: workspace });
run("CLI findings list", "node", [CLI, "findings", "list", "--skill", skillRel, "--json"], { cwd: workspace });
run("CLI pipeline status", "node", [CLI, "pipeline", "status", "--skill", skillRel, "--json"], { cwd: workspace });
run("CLI mcp print-config", "node", [CLI, "mcp", "print-config", "--ide", "cursor"], { cwd: workspace });
run("CLI detect", "node", [CLI, "detect"], { cwd: workspace });
run("CLI lint skill", "node", [CLI, "lint", skillRel], { cwd: workspace });
run("CLI validate skill", "node", [CLI, "validate", skillRel], { cwd: workspace });

console.log("\n--- Known backend blockers (expected to fail until deploy) ---");
runKnownBlocker(
  "CLI benchmark",
  "node",
  [CLI, "benchmark", "--skill", skillRel, "--json"],
  { cwd: workspace },
);
runKnownBlocker(
  "CLI compare",
  "node",
  [CLI, "compare", "--skill", skillRel, "--json"],
  { cwd: workspace },
);
runKnownBlocker(
  "CLI suggest",
  "node",
  [CLI, "suggest", "--skill", skillRel, "--json"],
  { cwd: workspace },
);
runKnownBlocker(
  "CLI pipeline run (test_optimize)",
  "node",
  [CLI, "pipeline", "run", "--skill", skillRel, "--stage", "test_optimize", "--no-watch", "--json"],
  { cwd: workspace },
);

const findingsList = run("CLI findings list (for ignore probe)", "node", [CLI, "findings", "list", "--skill", skillRel, "--json"], {
  cwd: workspace,
});
let findingKey;
if (findingsList.ok) {
  try {
    const parsed = JSON.parse(findingsList.out);
    findingKey = parsed.findings?.[0]?.key;
  } catch {
    /* ignore */
  }
}
if (findingKey) {
  runKnownBlocker(
    "CLI findings ignore",
    "node",
    [CLI, "findings", "ignore", "--skill", skillRel, "--key", findingKey, "--json"],
    { cwd: workspace },
  );
} else {
  console.log("○ CLI findings ignore (skipped: no findings to ignore)");
}

process.exit(summary());
