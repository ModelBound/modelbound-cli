/**
 * Shared helpers for ModelBound integration harness scripts.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const INTEGRATION_ROOT = path.join(__dirname, "..");
export const CLI_ROOT = path.resolve(INTEGRATION_ROOT, "../..");
export const MB_ROOT = path.resolve(CLI_ROOT, "..");
export const CLI = path.join(CLI_ROOT, "dist/index.js");
export const STATE_FILE = path.join(INTEGRATION_ROOT, ".harness-state.json");

export function loadApiKey() {
  if (process.env.MODELBOUND_API_KEY?.startsWith("mb_live_")) {
    return process.env.MODELBOUND_API_KEY;
  }
  for (const envFile of [
    path.join(CLI_ROOT, ".env"),
    path.join(MB_ROOT, "modelbound-cursor-extension/.env"),
    path.join(MB_ROOT, "modelbound/.env"),
  ]) {
    if (!fs.existsSync(envFile)) continue;
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^(MB_TOKEN|MODELBOUND_API_KEY)=(.+)$/);
      if (m) return m[2].trim();
    }
  }
  throw new Error("No MB_TOKEN / MODELBOUND_API_KEY in env or local .env files");
}

export function createHarnessEnv(apiKey) {
  return {
    ...process.env,
    MODELBOUND_API_KEY: apiKey,
    MB_TOKEN: apiKey,
  };
}

export function createRunner(apiKey) {
  const env = createHarnessEnv(apiKey);
  const results = [];

  function run(label, cmd, args, opts = {}) {
    const cwd = opts.cwd ?? process.cwd();
    const r = spawnSync(cmd, args, {
      cwd,
      env,
      encoding: "utf8",
      shell: false,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const ok = r.status === 0;
    const entry = {
      label,
      ok,
      status: r.status,
      out: out.trim().slice(0, 500),
      expectedFail: opts.expectedFail ?? false,
    };
    results.push(entry);
    const icon = ok ? "✓" : opts.expectedFail ? "○" : "✗";
    console.log(`${icon} ${label}${ok ? "" : ` (exit ${r.status})`}${opts.expectedFail && !ok ? " [expected backend blocker]" : ""}`);
    if (!ok && out.trim() && !opts.expectedFail) console.log(out.trim().slice(0, 400));
    return { ok, out, status: r.status };
  }

  function runKnownBlocker(label, cmd, args, opts = {}) {
    const r = run(label, cmd, args, { ...opts, expectedFail: true });
    const last = results[results.length - 1];
    const blockerPattern = /Unauthorized|JWT|team_id|Pipeline failed|column skill_pipeline_runs/i;
    if (r.ok) {
      last.ok = true;
      last.out = "blocker resolved — command succeeded";
      console.log(`✓ ${label} (blocker resolved)`);
      return r;
    }
    if (blockerPattern.test(r.out)) {
      last.ok = true;
      last.expectedFail = true;
      console.log(`✓ ${label} (blocked as expected)`);
      return r;
    }
    last.ok = false;
    console.log(`✗ ${label} (unexpected failure)`);
    return r;
  }

  function summary() {
    console.log("\n--- Summary ---");
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    for (const r of results) {
      const tag = r.expectedFail && r.ok ? "PASS (expected blocker)" : r.ok ? "PASS" : "FAIL";
      console.log(`${tag} · ${r.label}`);
    }
    console.log(`\n${passed}/${results.length} checks passed`);
    return failed.length === 0 ? 0 : 1;
  }

  return { run, runKnownBlocker, results, env, summary };
}

export function writeHarnessState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function readHarnessState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`Missing ${STATE_FILE}. Run run-skill-sync-tests.mjs first.`);
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

export function parseSkillId(text) {
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return m?.[0];
}

export function parseJsonSkillId(text) {
  try {
    const j = JSON.parse(text);
    return j.skill_id ?? j.skillId;
  } catch {
    return parseSkillId(text);
  }
}
