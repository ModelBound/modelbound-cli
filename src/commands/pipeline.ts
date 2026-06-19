import { Command } from "commander";
import pc from "picocolors";
import { callMcpTool, ensureSkillSynced, resolveSkillId, setWorkspaceContext } from "../core/skill.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

const TERMINAL = new Set(["passed", "failed", "completed", "errored", "skipped"]);

interface PipelineRun {
  id?: string;
  status?: string;
  failed_stage?: string;
  stage_results?: Record<string, unknown>;
  version_before?: string;
  version_after?: string;
}

export function registerPipeline(p: Command) {
  const pipe = p.command("pipeline").description("Skill Development Pipeline");

  pipe.command("run")
    .description("Run Test → Optimize → Production for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--stage <name>", "full | test_optimize | production", "full")
    .option("--targets <list>", "comma-separated targets", "save,marketplace,claude_export")
    .option("--bump <kind>", "version bump: patch|minor|major|none", "patch")
    .option("--override-gate", "bypass trust/latency/test gates", false)
    .option("--changelog <text>", "changelog entry")
    .option("--repo <name>", "org/repo override")
    .option("--no-watch", "do not poll stage progress")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const cwd = process.cwd();
      const mcpOpts = { profile, mcpUrl: g.mcpUrl, repo: opts.repo };

      await setWorkspaceContext(cwd, mcpOpts);
      const skillId = await ensureSkillSynced(cwd, opts.skill, mcpOpts);

      const r = await callMcpTool("run_skill_pipeline", {
        skill_id: skillId,
        stage: opts.stage,
        targets: String(opts.targets).split(",").map((s: string) => s.trim()).filter(Boolean),
        changelog: opts.changelog ?? null,
        version_bump: opts.bump,
        override_gate: !!opts.overrideGate,
      }, { ...mcpOpts, aliases: ["skills.runPipeline"] }) as { run_id?: string; id?: string; status?: string; version_after?: string };

      const runId = r.run_id ?? r.id;
      if (g.json) return printJson({ ...r, skill_id: skillId, run_id: runId });
      process.stdout.write(pc.dim(`run ${runId ?? "—"} started · skill ${skillId}\n`));
      if (opts.watch === false) {
        printSuccess(`Pipeline ${r.status ?? "started"} · run ${runId ?? "—"}${r.version_after ? ` · ${r.version_after}` : ""}`);
        return;
      }
      if (runId) await watchByRunId(runId, mcpOpts, g);
      else await watchBySkillId(skillId, mcpOpts, g);
    });

  pipe.command("status")
    .description("Show pipeline status for a skill or run")
    .option("--skill <target>", "skill file path, slug, or UUID (latest run)")
    .option("--run <id>", "specific pipeline run id")
    .option("--limit <n>", "number of runs to return", "1")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };

      let args: Record<string, unknown>;
      if (opts.run) {
        args = { run_id: opts.run };
      } else if (opts.skill) {
        const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
        args = { skill_id: skillId, limit: Number(opts.limit) };
      } else {
        throw new Error("Provide --skill or --run.");
      }

      const r = await callMcpTool(
        "get_skill_pipeline_status",
        args,
        { ...mcpOpts, aliases: ["skills.getPipelineStatus", "pipeline.status"] },
      );
      if (g.json) return printJson(r);
      renderStatus(r);
    });

  // Legacy positional aliases
  pipe.command("last <skillId>")
    .description("(legacy) Show latest pipeline run — prefer pipeline status --skill")
    .action(async (skillId: string, _opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const id = await resolveSkillId(process.cwd(), skillId, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool("get_skill_pipeline_status", { skill_id: id, limit: 1 }, { profile, mcpUrl: g.mcpUrl });
      if (g.json) return printJson(r);
      renderStatus(r);
    });

  pipe.command("config")
    .description("Read or update pipeline gate configuration for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--min-trust <n>", "minimum trust score 0-100", parseFloat)
    .option("--max-latency <ms>", "max latency budget in ms", parseFloat)
    .option("--enforce-trust", "enforce trust gate")
    .option("--no-enforce-trust", "disable trust gate")
    .option("--enforce-latency", "enforce latency gate")
    .option("--no-enforce-latency", "disable latency gate")
    .option("--enforce-tests", "enforce saved test cases gate")
    .option("--no-enforce-tests", "disable tests gate")
    .option("--targets <list>", "default production targets (comma-separated)")
    .option("--repo <name>", "org/repo override")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl, repo: opts.repo };
      await setWorkspaceContext(process.cwd(), mcpOpts);
      const skillId = await ensureSkillSynced(process.cwd(), opts.skill, mcpOpts);

      const args: Record<string, unknown> = { skill_id: skillId };
      if (opts.minTrust != null) args.min_trust_score = opts.minTrust;
      if (opts.maxLatency != null) args.max_latency_ms = opts.maxLatency;
      if (opts.enforceTrust) args.enforce_trust_gate = true;
      if (opts.noEnforceTrust) args.enforce_trust_gate = false;
      if (opts.enforceLatency) args.enforce_latency_gate = true;
      if (opts.noEnforceLatency) args.enforce_latency_gate = false;
      if (opts.enforceTests) args.enforce_tests_gate = true;
      if (opts.noEnforceTests) args.enforce_tests_gate = false;
      if (opts.targets) {
        args.default_targets = String(opts.targets).split(",").map((s: string) => s.trim()).filter(Boolean);
      }

      const hasUpdate = Object.keys(args).length > 1;
      if (!hasUpdate) {
        const skill = await callMcpTool("get_skill", { skill_id: skillId }, { ...mcpOpts, aliases: ["skills.get"] }) as { pipeline_config?: unknown };
        if (g.json) return printJson({ skill_id: skillId, pipeline_config: skill?.pipeline_config ?? {} });
        process.stdout.write(JSON.stringify({ skill_id: skillId, pipeline_config: skill?.pipeline_config ?? {} }, null, 2) + "\n");
        return;
      }

      const r = await callMcpTool("set_skill_pipeline_config", args, {
        ...mcpOpts,
        aliases: ["skills.setPipelineConfig", "pipeline.config"],
      });
      if (g.json) return printJson(r);
      printSuccess(`Pipeline config updated for ${skillId}`);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}

function renderStatus(payload: unknown): void {
  const data = payload as { runs?: PipelineRun[]; status?: string; stage_results?: unknown };
  const runs = data.runs ?? (data.status ? [data as PipelineRun] : []);
  if (!runs.length) {
    process.stdout.write("(no pipeline runs)\n");
    return;
  }
  for (const run of runs) {
    process.stdout.write(JSON.stringify(run, null, 2) + "\n");
  }
}

async function watchBySkillId(
  skillId: string,
  mcpOpts: { profile?: string; mcpUrl?: string },
  g: { json?: boolean },
): Promise<void> {
  const seen = new Set<string>();
  while (true) {
    const s = await callMcpTool("get_skill_pipeline_status", { skill_id: skillId, limit: 1 }, mcpOpts) as { runs?: PipelineRun[] };
    const run = s.runs?.[0];
    if (!run) break;
    emitStages(run, seen, g);
    if (run.status && TERMINAL.has(run.status)) {
      printSuccess(`Pipeline ${run.status} · run ${run.id ?? "—"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function watchByRunId(
  runId: string,
  mcpOpts: { profile?: string; mcpUrl?: string },
  g: { json?: boolean },
): Promise<void> {
  const seen = new Set<string>();
  while (true) {
    const s = await callMcpTool("get_skill_pipeline_status", { run_id: runId }, mcpOpts) as PipelineRun;
    emitStages(s, seen, g);
    if (s.status && TERMINAL.has(s.status)) {
      printSuccess(`Pipeline ${s.status} · run ${runId}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function emitStages(run: PipelineRun, seen: Set<string>, g: { json?: boolean }): void {
  const stages = run.stage_results;
  if (!stages || typeof stages !== "object") return;
  for (const [stage, detail] of Object.entries(stages)) {
    const key = `${stage}:${JSON.stringify(detail)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (g.json) process.stdout.write(JSON.stringify({ kind: "stage", stage, detail }) + "\n");
    else process.stdout.write(`  ${pc.dim("·")} ${stage}${detail ? pc.dim(" — " + JSON.stringify(detail)) : ""}\n`);
  }
}
