// `mb pipeline run` + `mb pipeline status` — Skill Development Pipeline.
// Mirrors the cloud `pipeline.*` MCP tools.
import { Command } from "commander";
import ora from "ora";
import { api } from "../lib/api.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

interface PipelineRun {
  pipeline_run_id: string;
  status: "queued" | "running" | "passed" | "failed";
  phases?: Array<{ name: string; status: string; findings?: number; score?: number }>;
}

export function registerPipeline(program: Command): void {
  const pipeline = program
    .command("pipeline")
    .description("Skill Development Pipeline — lint, trust, test, benchmark, optimize.");

  pipeline
    .command("run <skill>")
    .description("Run the pipeline against a skill (slug or ID).")
    .option("--phases <list>", "comma-separated subset (lint,trust,test,benchmark,optimize)")
    .option("--wait", "wait for completion and print results", false)
    .action(async (skill: string, opts: { phases?: string; wait: boolean }, cmd: Command) => {
      const g = globalOpts(cmd);
      const spinner = g.json ? null : ora(`Starting pipeline for ${skill}…`).start();
      const body: Record<string, unknown> = { slug: skill };
      if (opts.phases) body.phases = opts.phases.split(",").map((s) => s.trim());
      const run = await api<PipelineRun>("/api/cli/pipeline/run", {
        method: "POST",
        apiUrl: g.apiUrl,
        body,
      });
      spinner?.succeed(`Pipeline ${run.pipeline_run_id} ${run.status}.`);
      if (!opts.wait) {
        if (g.json) return printJson(run);
        printSuccess(`Run: mb pipeline status ${run.pipeline_run_id}`);
        return;
      }
      // Poll until terminal state.
      const wait = ora("Running…").start();
      let final: PipelineRun = run;
      while (final.status === "queued" || final.status === "running") {
        await new Promise((r) => setTimeout(r, 2000));
        final = await api<PipelineRun>(
          `/api/cli/pipeline/status?id=${encodeURIComponent(final.pipeline_run_id)}`,
          { apiUrl: g.apiUrl },
        );
      }
      wait.stop();
      if (g.json) return printJson(final);
      printSuccess(`Status: ${final.status}`);
      for (const p of final.phases ?? []) {
        // eslint-disable-next-line no-console
        console.log(`  ${p.status === "passed" ? "✓" : p.status === "failed" ? "✗" : "·"} ${p.name}` +
          (p.score != null ? `  score=${p.score}` : "") +
          (p.findings != null ? `  findings=${p.findings}` : ""));
      }
      if (final.status === "failed") process.exit(2);
    });

  pipeline
    .command("status <runId>")
    .description("Get the status of a pipeline run.")
    .action(async (runId: string, _opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const res = await api<PipelineRun>(
        `/api/cli/pipeline/status?id=${encodeURIComponent(runId)}`,
        { apiUrl: g.apiUrl },
      );
      if (g.json) return printJson(res);
      printSuccess(`${res.pipeline_run_id} → ${res.status}`);
      for (const p of res.phases ?? []) {
        // eslint-disable-next-line no-console
        console.log(`  ${p.name}: ${p.status}`);
      }
    });
}
