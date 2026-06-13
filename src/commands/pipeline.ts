import { Command } from "commander";
import { z } from "zod";
import pc from "picocolors";
import { createClient, uuidv4 } from "../core/client.js";
import { printSummary } from "../ui/summary.js";

const RunResp = z.object({ run_id: z.string(), status: z.string().optional() });
const StatusResp = z.object({
  status: z.string(),
  stage_results: z.array(z.object({ stage: z.string(), ok: z.boolean().optional(), msg: z.string().optional() })).optional(),
  summary: z.record(z.any()).optional(),
});

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
    .action(async (skillId: string, opts) => {
      const json = !!p.opts().json;
      const client = createClient({ profile: p.opts().profile ?? "default" });
      const idem = uuidv4();
      const r = await client.call("run-skill-pipeline", {
        skill_id: skillId,
        targets: String(opts.targets).split(",").map((s) => s.trim()).filter(Boolean),
        version_bump: opts.bump,
        apply_optimization: !!opts.applyOptimization,
        override_gates: !!opts.overrideGates,
        changelog: opts.changelog,
      }, RunResp, idem);
      if (!json) process.stdout.write(pc.dim(`run ${r.run_id} started\n`));
      if (opts.watch === false) { printSummary({ ok: true, title: `Pipeline started`, meta: `run ${r.run_id}` }, json); return; }
      await watch(client, r.run_id, json);
    });

  pipe.command("status <runId>").description("Show status for a pipeline run").action(async (runId: string) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const s = await client.call("skill-pipeline-status", { run_id: runId }, StatusResp);
    process.stdout.write(JSON.stringify(s, null, 2) + "\n");
  });

  pipe.command("last <skillId>").description("Show the latest pipeline run for a skill").action(async (skillId: string) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const s = await client.call("skill-pipeline-status", { skill_id: skillId, latest: true }, StatusResp);
    process.stdout.write(JSON.stringify(s, null, 2) + "\n");
  });
}

async function watch(client: ReturnType<typeof createClient>, runId: string, json: boolean) {
  const seen = new Set<string>();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const s = await client.call("skill-pipeline-status", { run_id: runId }, StatusResp);
    for (const sr of s.stage_results ?? []) {
      const key = `${sr.stage}:${sr.ok ?? ""}:${sr.msg ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (json) process.stdout.write(JSON.stringify({ kind: "stage", ...sr }) + "\n");
      else process.stdout.write(`  ${sr.ok ? pc.green("✓") : pc.dim("·")} ${sr.stage}${sr.msg ? pc.dim(" — " + sr.msg) : ""}\n`);
    }
    if (["complete", "failed", "cancelled"].includes(s.status)) {
      printSummary({
        ok: s.status === "complete",
        title: `Pipeline ${s.status}`,
        meta: `run ${runId}`,
        undo: `modelbound version list <skill>  # then restore`,
      }, json);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
