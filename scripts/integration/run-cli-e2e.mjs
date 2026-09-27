#!/usr/bin/env node
/**
 * Full modelbound-cli E2E harness (offline + optional cloud).
 *
 * Usage:
 *   npm run build && node scripts/integration/run-cli-e2e.mjs
 *   MODELBOUND_API_KEY=mb_live_... node scripts/integration/run-cli-e2e.mjs
 *
 * Phases:
 *   1. Meta (--help, --version)
 *   2. Offline local commands in a temp fixture
 *   3. Cloud/API (skipped if no MODELBOUND_API_KEY)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLI, createRunner, loadApiKey } from "./lib/harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTEGRATION_ROOT = __dirname;
const E2E_STATE = path.join(INTEGRATION_ROOT, ".cli-e2e-state.json");

function writeE2eState(state) {
  fs.writeFileSync(E2E_STATE, JSON.stringify(state, null, 2));
}

function readE2eState() {
  return JSON.parse(fs.readFileSync(E2E_STATE, "utf8"));
}

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, msg) {
  failed++;
  console.log(`  ✗ ${label}`);
  if (msg) console.log(`    ${String(msg).trim().slice(0, 500)}`);
}

function skip(label, reason) {
  skipped++;
  console.log(`  ○ ${label} (${reason})`);
}

function runCli(args, cwd, env = process.env) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
}

function expectOk(label, r, check) {
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    fail(label, out);
    return false;
  }
  if (check && !check(out, r)) {
    fail(label, "output check failed");
    return false;
  }
  ok(label);
  return true;
}

function phaseMeta() {
  console.log("\nPhase 1 · meta\n");
  let r = runCli(["--help"], process.cwd());
  expectOk("global --help", r, (o) => o.length > 200 && /Usage:/i.test(o));

  r = runCli(["--version"], process.cwd());
  expectOk("global --version", r, (o) => /\d+\.\d+\.\d+/.test(o));

  r = runCli(["--help"], process.cwd());
  const mustMention = [
    "init",
    "sync",
    "health",
    "report",
    "reliability",
    "trace",
    "harness",
    "skills",
    "pipeline",
  ];
  for (const cmd of mustMention) {
    if (!r.stdout.includes(cmd)) fail(`help lists ${cmd}`, r.stdout.slice(0, 200));
    else ok(`help lists ${cmd}`);
  }
}

function phaseOffline() {
  console.log("\nPhase 2 · offline local\n");

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mb-cli-full-e2e-"));
  fs.mkdirSync(path.join(fixture, ".cursor", "skills"), { recursive: true });
  fs.mkdirSync(path.join(fixture, ".cursor", "rules"), { recursive: true });

  const skillRel = ".cursor/skills/e2e-skill/SKILL.md";
  const ruleRel = ".cursor/rules/e2e-rule.mdc";

  fs.writeFileSync(
    path.join(fixture, ruleRel),
    `---
name: e2e-rule
description: Triggered when E2E tests run lint; minimal rule fixture for offline checks.
---

# E2E rule

Follow project conventions.
`,
  );

  try {
    expectOk("detect", runCli(["detect"], fixture), (o) => o.includes("Cursor") || o.includes(".cursor"));

    expectOk("init", runCli(["init"], fixture));
    if (!fs.existsSync(path.join(fixture, ".modelbound", "task-budgets.json"))) {
      fail("task-budgets.json exists", "missing");
    } else {
      ok("task-budgets.json exists");
    }

    expectOk(
      "new skill",
      runCli(
        [
          "new",
          "e2e-skill",
          "-d",
          "Triggered when full CLI E2E runs; validates scoped skill scaffolding offline.",
          "-o",
          skillRel,
        ],
        fixture,
      ),
    );

    const skillPath = path.join(fixture, skillRel);
    const skillRaw = fs.readFileSync(skillPath, "utf8");
    if (skillRaw.includes("Scope Constraints") && skillRaw.includes("<task-split>")) {
      ok("scope block present");
    } else {
      fail("scope block present", skillRaw.slice(0, 120));
    }

    expectOk("lint skill", runCli(["lint", skillRel], fixture));
    expectOk("validate skill", runCli(["validate", skillRel], fixture), (o) => o.includes("valid"));
    expectOk("trust h5", runCli(["trust", skillRel], fixture), (o) => o.includes("h5"));

    expectOk("review request", runCli(["review", "request", skillRel], fixture));
    expectOk("review approve", runCli(["review", "approve", skillRel, "--by", "e2e"], fixture));
    expectOk("review gate (approved)", runCli(["review", "gate", skillRel], fixture));
    expectOk(
      "review status",
      runCli(["review", "status", skillRel], fixture),
      (o) => o.includes('"review_state": "approved"'),
    );

    fs.appendFileSync(skillPath, "\n\n# edited\n");
    const gateAfterEdit = runCli(["review", "gate", skillRel], fixture);
    if (gateAfterEdit.status === 0) fail("review gate after edit", "expected non-zero");
    else ok("review gate blocks after edit");

    expectOk(
      "scaffold reject-me",
      runCli(
        [
          "new",
          "reject-me",
          "-d",
          "Triggered when E2E tests reject flow; disposable skill for review reject.",
          "-o",
          ".cursor/skills/reject-me/SKILL.md",
        ],
        fixture,
      ),
    );
    expectOk("review reject", runCli(["review", "reject", ".cursor/skills/reject-me/SKILL.md"], fixture));

    expectOk(
      "new --no-scope",
      runCli(
        [
          "new",
          "bare",
          "-d",
          "Triggered when testing opt-out; omits default scope block in E2E.",
          "-o",
          ".cursor/skills/bare/SKILL.md",
          "--no-scope",
        ],
        fixture,
      ),
    );
    const bare = fs.readFileSync(path.join(fixture, ".cursor/skills/bare/SKILL.md"), "utf8");
    if (bare.includes("<task-split>")) fail("new --no-scope", "scope present");
    else ok("new --no-scope omits task-split");

    expectOk("config profiles", runCli(["config", "profiles"], fixture));
    expectOk("config get", runCli(["config", "get"], fixture), (o) => o.includes("{"));
    expectOk("mcp print-config", runCli(["mcp", "print-config", "--ide", "cursor"], fixture), (o) =>
      o.includes("mcpServers"),
    );
    expectOk("backup list", runCli(["backup", "list"], fixture));
    expectOk("backup prune", runCli(["backup", "prune", "--days", "365"], fixture));

    expectOk("report --help", runCli(["report", "--help"], fixture), (o) => o.includes("verdict"));
    expectOk("reliability --help", runCli(["reliability", "--help"], fixture));
    expectOk("trace --help", runCli(["trace", "--help"], fixture), (o) => o.includes("--skill"));
    expectOk("harness --help", runCli(["harness", "--help"], fixture), (o) => o.includes("unattended"));

    // Store fixture path for optional cloud phase reuse
    writeE2eState({
      workspace: fixture,
      skillRel,
      slug: "e2e-skill",
    });
  } catch (e) {
    fail("offline phase", e);
  }
}

function phaseCloud() {
  console.log("\nPhase 3 · cloud / API\n");

  let apiKey;
  try {
    apiKey = loadApiKey();
  } catch {
    skip("cloud phase", "set MODELBOUND_API_KEY or add to .env to run");
    return;
  }

  const { run, runKnownBlocker, summary, results } = createRunner(apiKey);
  let state;
  try {
    state = readE2eState();
  } catch {
    fail("e2e state", "offline phase did not write state");
    return;
  }

  const workspace = state.workspace;
  const skillRel = state.skillRel;

  run("auth status", "node", [CLI, "auth", "status"], { cwd: workspace });
  run("whoami alias", "node", [CLI, "whoami"], { cwd: workspace });
  run("health --json", "node", [CLI, "health", "--json"], { cwd: workspace });
  run("skills list --json", "node", [CLI, "skills", "list", "--json"], { cwd: workspace });
  run("mcp print-config", "node", [CLI, "mcp", "print-config"], { cwd: workspace });

  if (skillRel && fs.existsSync(path.join(workspace, skillRel))) {
    run("lint local skill", "node", [CLI, "lint", skillRel], { cwd: workspace });
    run("validate local skill", "node", [CLI, "validate", skillRel], { cwd: workspace });
  }

  run("reliability --json", "node", [CLI, "--json", "reliability"], { cwd: workspace });

  // Report requires a real slug; use harness slug and accept 404 if skill not in cloud
  const reportSlug = process.env.CLI_E2E_REPORT_SLUG ?? state.slug ?? "e2e-skill";
  const report = run("report worked (harness slug)", "node", [
    CLI,
    "report",
    reportSlug,
    "--verdict",
    "worked",
    "--note",
    "cli e2e harness",
  ], { cwd: workspace });
  if (!report.ok) {
    const last = results[results.length - 1];
    if (/404|not found|unknown skill|skill_not_found/i.test(report.out)) {
      last.ok = true;
      last.expectedFail = true;
      skip("report API", "harness slug not in cloud library");
    }
  }

  runKnownBlocker("pipeline status", "node", [CLI, "pipeline", "status", "--skill", skillRel, "--json"], {
    cwd: workspace,
  });
  runKnownBlocker("findings list", "node", [CLI, "findings", "list", "--skill", skillRel, "--json"], {
    cwd: workspace,
  });
  runKnownBlocker("version list", "node", [CLI, "version", "list", "--skill", skillRel, "--json"], {
    cwd: workspace,
  });
  runKnownBlocker("test list", "node", [CLI, "test", "list", "--skill", skillRel, "--json"], {
    cwd: workspace,
  });

  const code = summary();
  if (code !== 0) failed += 1;
  else passed += 1;
}

function main() {
  console.log("modelbound-cli full E2E\n");

  if (!fs.existsSync(CLI)) {
    console.error(`Missing ${CLI}. Run npm run build first.`);
    process.exit(1);
  }

  phaseMeta();
  phaseOffline();
  phaseCloud();

  console.log(`\n--- Totals ---`);
  console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
}

main();
