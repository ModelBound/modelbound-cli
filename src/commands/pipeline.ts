import { Command } from "commander";
import pc from "picocolors";
import { api } from "../lib/api.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

export function registerPipeline(p: Command) {
  const pipe = p.command("pipeline").description("Skill Development Pipeline");

  pipe.command("run <skillId>")
    .description("Run Test → Optimize → Production for a skill")
    .option("--targets <list>", "comma-separated targets (marketplace,claude,...)", "marketplace")
    .option("--bump <kind>", "version bump: patch|minor|major|none", "patch")
    .option("--apply-optimization", "apply optimization stage", false)
    .option("--override-gates", "bypass trust/latency/test gates", false)
    .option("--changelog <text>", "changelog entry")
    .option("--no-watch", "do not stream stage progress")
    .option("--yes", "skip confirmation when --apply-optimization is set")
    .action(async (skillId: string, opts, cmd) => {
      const g = globalOpts(cmd);
      const r = await api<{ run_id: string; status?: string; version_after?: string }>("/api/cli/pipeline/run", {
        method: "POST",
        apiUrl: g.apiUrl,
        body: {
          skill_id: skillId,
          targets: String(opts.targets).split(",").map((s: string) => s.trim()).filter(Boolean),
          version_bump: opts.bump,
          apply_optimization: !!opts.applyOptimization,
          override_gates: !!opts.overrideGates,
          changelog: opts.changelog,
        },
      });
      if (g.json) return printJson(r);
      process.stdout.write(pc.dim(`run ${r.run_id} started\n`));
      if (opts.watch === false) {
        printSuccess(`Pipeline ${r.status ?? "started"} · run ${r.run_id}${r.version_after ? ` · ${r.version_after}` : ""}`);
        return;
      }
      await watch(r.run_id, g);
    });

  pipe.command("status <runId>").description("Show status for a pipeline run").action(async (runId: string, _opts, cmd) => {
    const g = globalOpts(cmd);
    const r = await api<{ status: string; stage_results?: Array<{ stage: string; ok?: boolean; msg?: string }> }>(
      "/api/cli/pipeline/status",
      { method: "POST", apiUrl: g.apiUrl, body: { pipeline_run_id: runId } },
    );
    if (g.json) return printJson(r);
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  });

  pipe.command("last <skillId>").description("Show the latest pipeline run for a skill").action(async (skillId: string, _opts, cmd) => {
    const g = globalOpts(cmd);
    const r = await api<{ status: string; stage_results?: Array<{ stage: string; ok?: boolean; msg?: string }> }>(
      "/api/cli/pipeline/status",
      { method: "POST", apiUrl: g.apiUrl, body: { skill_id: skillId, latest: true } },
    );
    if (g.json) return printJson(r);
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  });
}

async function watch(runId: string, g: { json?: boolean; apiUrl?: string }) {
  const seen = new Set<string>();
  while (true) {
    const s = await api<{ status: string; stage_results?: Array<{ stage: string; ok?: boolean; msg?: string }> }>(
      "/api/cli/pipeline/status",
      { method: "POST", apiUrl: g.apiUrl, body: { pipeline_run_id: runId } },
    );
    for (const sr of s.stage_results ?? []) {
      const key = `${sr.stage}:${sr.ok ?? ""}:${sr.msg ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (g.json) process.stdout.write(JSON.stringify({ kind: "stage", ...sr }) + "\n");
      else process.stdout.write(`  ${sr.ok ? pc.green("✓") : pc.dim("·")} ${sr.stage}${sr.msg ? pc.dim(" — " + sr.msg) : ""}\n`);
    }
    if (["complete", "failed", "cancelled", "passed"].includes(s.status)) {
      printSuccess(`Pipeline ${s.status} · run ${runId}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
