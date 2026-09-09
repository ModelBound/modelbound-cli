#!/usr/bin/env node
/**
 * Offline E2E for local anti-slop CLI commands (init, new, trust, review).
 * Usage: npm run build && node scripts/integration/run-repo-local-e2e.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, "../../dist/index.js");

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, msg) {
  failed++;
  console.log(`  ✗ ${name}`);
  console.log(`    ${msg}`);
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

function main() {
  console.log("local anti-slop E2E (modelbound-cli)\n");

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "mb-cli-e2e-"));
  fs.mkdirSync(path.join(fixtureDir, ".cursor", "skills"), { recursive: true });

  const skillRel = ".cursor/skills/e2e-skill/SKILL.md";

  try {
    let r = run(["init"], fixtureDir);
    if (r.status !== 0) fail("init", r.stderr || r.stdout);
    else ok("init");

    if (!fs.existsSync(path.join(fixtureDir, ".modelbound", "task-budgets.json"))) {
      fail("task-budgets.json", "missing");
    } else {
      ok("task-budgets.json created");
    }

    r = run(
      [
        "new",
        "e2e-skill",
        "-d",
        "Triggered when CLI E2E runs; validates offline scope scaffolding.",
        "-o",
        skillRel,
      ],
      fixtureDir,
    );
    if (r.status !== 0) {
      fail("new", r.stderr || r.stdout);
    } else {
      ok("new");
    }

    const skillPath = path.join(fixtureDir, skillRel);
    if (!fs.existsSync(skillPath)) {
      fail("skill file exists", skillRel);
    } else {
      const raw = fs.readFileSync(skillPath, "utf8");
      if (!raw.includes("Scope Constraints") || !raw.includes("<task-split>")) {
        fail("scope block", "missing from scaffolded skill");
      } else {
        ok("scope block in scaffolded skill");
      }
    }

    r = run(["trust", skillRel], fixtureDir);
    if (r.status !== 0 || !r.stdout.includes("h5")) {
      fail("trust", r.stderr || r.stdout);
    } else {
      ok("trust (h5)");
    }

    r = run(["review", "request", skillRel], fixtureDir);
    if (r.status !== 0) fail("review request", r.stderr || r.stdout);
    else ok("review request");

    r = run(["review", "approve", skillRel, "--by", "e2e"], fixtureDir);
    if (r.status !== 0) fail("review approve", r.stderr || r.stdout);
    else ok("review approve");

    r = run(["review", "gate", skillRel], fixtureDir);
    if (r.status !== 0) fail("review gate (approved)", r.stderr || r.stdout);
    else ok("review gate passes when approved");

    r = run(["review", "status", skillRel], fixtureDir);
    if (r.status !== 0 || !r.stdout.includes('"review_state": "approved"')) {
      fail("review status", r.stderr || r.stdout);
    } else {
      ok("review status JSON");
    }

    fs.writeFileSync(skillPath, fs.readFileSync(skillPath, "utf8") + "\n\nEdited.\n", "utf8");
    r = run(["review", "gate", skillRel], fixtureDir);
    if (r.status === 0) fail("review gate after edit", "expected exit 1");
    else ok("review gate blocks after body edit");

    r = run(
      [
        "new",
        "no-scope",
        "-d",
        "Triggered when testing opt-out; omits scope block.",
        "-o",
        ".cursor/skills/no-scope/SKILL.md",
        "--no-scope",
      ],
      fixtureDir,
    );
    if (r.status !== 0) {
      fail("new --no-scope", r.stderr || r.stdout);
    } else {
      const noScope = fs.readFileSync(path.join(fixtureDir, ".cursor/skills/no-scope/SKILL.md"), "utf8");
      if (noScope.includes("<task-split>")) fail("--no-scope", "scope block present");
      else ok("new --no-scope");
    }
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
