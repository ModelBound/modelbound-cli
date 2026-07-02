#!/usr/bin/env node
/**
 * End-to-end skill sync tests across ModelBound clients.
 * Usage: node scripts/integration/run-skill-sync-tests.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  CLI,
  INTEGRATION_ROOT,
  MB_ROOT,
  createRunner,
  loadApiKey,
  parseJsonSkillId,
  parseSkillId,
  writeHarnessState,
} from "./lib/harness.mjs";

const WORKSPACE = path.join(INTEGRATION_ROOT, "workspace");
const PULL_DIR = path.join(WORKSPACE, "pull-staging");
const ALT_WORKSPACE = path.join(INTEGRATION_ROOT, "workspace-alt");
const REPO = "ModelBound/modelbound-cli";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const SLUG = `sync-harness-${RUN_ID}`;
const SKILL_REL = `.modelbound/${SLUG}.md`;

const CLAUDE_PUSH = path.join(MB_ROOT, "modelbound-claude-code-plugin/dist/push-skill.js");
const CURSOR_MB = path.join(MB_ROOT, "modelbound-cursor-plugin/scripts/mb.mjs");
const MCP_CLOUD_TEST = path.join(MB_ROOT, "modelbound-mcp-server/scripts/cloud-sync-test.mjs");

const API_KEY = loadApiKey();
const { run, results, summary } = createRunner(API_KEY);

function writeSkill(dir, rel, marker, version) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    `---
name: ${SLUG}
description: Skill sync harness ${version}
version: ${version}
run_id: ${RUN_ID}
---

# Sync harness ${version}

Marker: ${marker}

Follow project conventions when editing agent skills.
`,
  );
  return p;
}

async function mcpGetSkillBody(skillId) {
  const res = await fetch("https://mcp.modelbound.co/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "get_skill", arguments: { skill_id: skillId } },
    }),
  });
  const raw = await res.text();
  const line = raw.split("\n").filter((l) => l.startsWith("data:")).pop()?.slice(5).trim();
  const parsed = line ? JSON.parse(line) : JSON.parse(raw);
  const text = parsed?.result?.content?.[0]?.text ?? "";
  try {
    const j = JSON.parse(text);
    return j.body_md ?? j.body ?? j.skill?.body_md ?? text;
  } catch {
    return text;
  }
}

function setupWorkspace(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, ".modelbound"), { recursive: true });
  fs.mkdirSync(PULL_DIR, { recursive: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["remote", "add", "origin", `https://github.com/${REPO}.git`], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "sync-test@modelbound.co"], { cwd: dir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "ModelBound Sync Test"], { cwd: dir, encoding: "utf8" });
}

console.log(`Skill sync harness · run=${RUN_ID}\n`);

setupWorkspace(WORKSPACE);
writeSkill(WORKSPACE, SKILL_REL, "cli-v1", "v1");

run("CLI context set", "node", [CLI, "context", "set", "--repo", REPO], { cwd: WORKSPACE });
const sync1 = run("CLI sync v1", "node", [CLI, "sync", "--file", SKILL_REL, "--json"], { cwd: WORKSPACE });
let skillId = parseJsonSkillId(sync1.out);
if (!skillId) skillId = parseSkillId(sync1.out);
let extSkillId = skillId;

writeSkill(WORKSPACE, SKILL_REL, "cli-v2", "v2");
run("CLI sync v2 (update)", "node", [CLI, "sync", "--file", SKILL_REL, "--json"], { cwd: WORKSPACE });

if (skillId) {
  fs.rmSync(path.join(PULL_DIR, "cli"), { recursive: true, force: true });
  fs.mkdirSync(path.join(PULL_DIR, "cli"), { recursive: true });
  const pullDest = path.join(PULL_DIR, "cli", `${SLUG}.md`);
  const pull = run("CLI pull (MCP get_skill)", "node", [CLI, "pull", skillId, "--out", pullDest], {
    cwd: path.join(PULL_DIR, "cli"),
  });
  if (pull.ok) {
    const body = fs.existsSync(pullDest) ? fs.readFileSync(pullDest, "utf8") : "";
    const ok = body.includes("cli-v2");
    results.push({ label: "CLI pull contains v2", ok, out: ok ? "marker found" : body.slice(0, 120) });
    console.log(`${ok ? "✓" : "✗"} CLI pull contains v2`);
  } else {
    try {
      const body = await mcpGetSkillBody(skillId);
      const ok = body.includes("cli-v2");
      results.push({ label: "CLI pull contains v2", ok, out: ok ? "MCP fallback ok" : body.slice(0, 120) });
      console.log(`${ok ? "✓" : "✗"} CLI pull contains v2 (MCP fallback)`);
    } catch (e) {
      results.push({ label: "CLI pull contains v2", ok: false, out: String(e) });
      console.log(`✗ CLI pull: ${e}`);
    }
  }
} else {
  results.push({ label: "CLI skill_id capture", ok: false, out: sync1.out });
  console.log("✗ CLI skill_id capture");
}

if (fs.existsSync(MCP_CLOUD_TEST)) {
  writeSkill(WORKSPACE, `.modelbound/${SLUG}-mcp.md`, "mcp-v1", "v1");
  run("MCP cloud push v1", "node", [MCP_CLOUD_TEST, "push", `.modelbound/${SLUG}-mcp.md`, REPO], { cwd: WORKSPACE });
  writeSkill(WORKSPACE, `.modelbound/${SLUG}-mcp.md`, "mcp-v2", "v2");
  run("MCP cloud push v2", "node", [MCP_CLOUD_TEST, "push", `.modelbound/${SLUG}-mcp.md`, REPO], { cwd: WORKSPACE });
  run("MCP cloud pull", "node", [MCP_CLOUD_TEST, "pull", `${SLUG}-mcp`, PULL_DIR], { cwd: WORKSPACE });
  const mcpPull = path.join(PULL_DIR, `${SLUG}-mcp.md`);
  const mcpOk = fs.existsSync(mcpPull) && fs.readFileSync(mcpPull, "utf8").includes("mcp-v2");
  results.push({ label: "MCP pull contains v2", ok: mcpOk, out: mcpOk ? "ok" : "missing marker" });
  console.log(`${mcpOk ? "✓" : "✗"} MCP pull contains v2`);
} else {
  console.log("⊘ MCP cloud test script missing");
}

writeSkill(WORKSPACE, `.modelbound/${SLUG}-cursor.md`, "cursor-v1", "v1");
run("Cursor plugin sync v1", "node", [CURSOR_MB, "context", "set", "--repo", REPO], { cwd: WORKSPACE });
run("Cursor plugin sync v1 file", "node", [CURSOR_MB, "sync", "--file", `.modelbound/${SLUG}-cursor.md`], { cwd: WORKSPACE });
writeSkill(WORKSPACE, `.modelbound/${SLUG}-cursor.md`, "cursor-v2", "v2");
run("Cursor plugin sync v2", "node", [CURSOR_MB, "sync", "--file", `.modelbound/${SLUG}-cursor.md`], { cwd: WORKSPACE });

if (fs.existsSync(CLAUDE_PUSH)) {
  writeSkill(WORKSPACE, `.modelbound/${SLUG}-claude.md`, "claude-v1", "v1");
  run("Claude plugin push v1", "node", [CLAUDE_PUSH, `.modelbound/${SLUG}-claude.md`], { cwd: WORKSPACE });
  writeSkill(WORKSPACE, `.modelbound/${SLUG}-claude.md`, "claude-v2", "v2");
  run("Claude plugin push v2", "node", [CLAUDE_PUSH, `.modelbound/${SLUG}-claude.md`], { cwd: WORKSPACE });
} else {
  console.log("⊘ Claude plugin not built");
}

setupWorkspace(ALT_WORKSPACE);
writeSkill(ALT_WORKSPACE, SKILL_REL, "extension-v1", "v1");
run("Extension path context set", "node", [CLI, "context", "set", "--repo", REPO], { cwd: ALT_WORKSPACE });
const extSync1 = run("Extension path sync v1", "node", [CLI, "sync", "--file", SKILL_REL, "--json"], { cwd: ALT_WORKSPACE });
extSkillId = parseJsonSkillId(extSync1.out) ?? skillId;
writeSkill(ALT_WORKSPACE, SKILL_REL, "extension-v2", "v2");
run("Extension path sync v2", "node", [CLI, "sync", "--file", SKILL_REL, "--json"], { cwd: ALT_WORKSPACE });

if (extSkillId) {
  try {
    const body = await mcpGetSkillBody(extSkillId);
    const ok = body.includes("extension-v2");
    results.push({ label: "Extension MCP get_skill has v2", ok, out: ok ? "ok" : body.slice(0, 120) });
    console.log(`${ok ? "✓" : "✗"} Extension MCP get_skill has v2`);
  } catch (e) {
    results.push({ label: "Extension MCP get_skill has v2", ok: false, out: String(e) });
    console.log(`✗ Extension MCP get_skill: ${e}`);
  }
}

console.log("\n--- Cross-workspace conflict ---");
const cloudCheckId = extSkillId ?? skillId;
if (cloudCheckId) {
  try {
    const cloudBody = await mcpGetSkillBody(cloudCheckId);
    const altWins = cloudBody.includes("extension-v2");
    results.push({
      label: "Alt workspace overwrite visible in cloud",
      ok: altWins,
      out: altWins ? "extension-v2 marker" : cloudBody.slice(0, 120),
    });
    console.log(`${altWins ? "✓" : "✗"} Alt workspace overwrite visible in cloud`);
  } catch (e) {
    results.push({ label: "Alt workspace overwrite visible in cloud", ok: false, out: String(e) });
    console.log(`✗ Cross-workspace cloud check: ${e}`);
  }
}

writeSkill(WORKSPACE, `.modelbound/${SLUG}-hosted.md`, "hosted-v1", "v1");
run("Hosted MCP context", "node", [CLI, "context", "set", "--repo", REPO], { cwd: WORKSPACE });
const hosted1 = run("Hosted MCP sync v1", "node", [CLI, "sync", "--file", `.modelbound/${SLUG}-hosted.md`, "--json"], { cwd: WORKSPACE });
const hostedId = parseJsonSkillId(hosted1.out);
writeSkill(WORKSPACE, `.modelbound/${SLUG}-hosted.md`, "hosted-v2", "v2");
run("Hosted MCP sync v2", "node", [CLI, "sync", "--file", `.modelbound/${SLUG}-hosted.md`, "--json"], { cwd: WORKSPACE });
if (hostedId) {
  try {
    const body = await mcpGetSkillBody(hostedId);
    const ok = body.includes("hosted-v2");
    results.push({ label: "Hosted MCP round-trip v2", ok, out: ok ? "ok" : body.slice(0, 120) });
    console.log(`${ok ? "✓" : "✗"} Hosted MCP round-trip v2`);
  } catch (e) {
    results.push({ label: "Hosted MCP round-trip v2", ok: false, out: String(e) });
    console.log(`✗ Hosted MCP round-trip: ${e}`);
  }
}

console.log("\n--- Optimize & test ---");
if (skillId) {
  run("CLI optimize dry-run (by skill id)", "node", [CLI, "optimize", skillId, "--dry-run", "--json"], { cwd: WORKSPACE });
}
run("CLI optimize dry-run (local file)", "node", [CLI, "optimize", SKILL_REL, "--dry-run", "--json"], { cwd: WORKSPACE });
const testName = `Harness check ${RUN_ID}`;
const testPrompt = "Summarize what this skill is for in one sentence.";
run("CLI test create", "node", [CLI, "test", "create", "--skill", SKILL_REL, "--name", testName, "--prompt", testPrompt, "--json"], { cwd: WORKSPACE });
run("CLI test run", "node", [CLI, "test", "run", "--skill", SKILL_REL, "--json"], { cwd: WORKSPACE });
run("CLI test seed", "node", [CLI, "test", "seed", "--skill", SKILL_REL, "--name", testName, "--prompt", testPrompt, "--no-pipeline", "--json"], { cwd: WORKSPACE });

if (skillId) {
  writeHarnessState({
    runId: RUN_ID,
    skillId,
    skillRel: SKILL_REL,
    workspace: WORKSPACE,
    repo: REPO,
  });
}

process.exit(summary());
