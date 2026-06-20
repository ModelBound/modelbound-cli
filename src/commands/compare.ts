import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";

function normalizeVersion(label: string): string {
  return String(label).replace(/^v/i, "");
}

export { normalizeVersion };

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
      const from = normalizeVersion(opts.from);
      const to = normalizeVersion(opts.to);
      const r = await callMcpTool(
        "compare_skill_versions",
        {
          skill_id: skillId,
          from_version: from,
          to_version: to,
          version_a: from,
          version_b: to,
        },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.compareVersions"] },
      );
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
