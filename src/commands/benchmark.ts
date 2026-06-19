import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";

export function registerBenchmark(p: Command) {
  p.command("benchmark")
    .description("Run benchmark latency suite for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "benchmark_skill",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.benchmark"] },
      );
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
