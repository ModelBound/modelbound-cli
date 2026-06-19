import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";

export function registerCompare(p: Command) {
  p.command("compare")
    .description("Compare two skill versions")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--from <version>", "source version label", "latest")
    .option("--to <version>", "target version label", "current")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "compare_skill_versions",
        { skill_id: skillId, from_version: opts.from, to_version: opts.to },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.compareVersions"] },
      );
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
