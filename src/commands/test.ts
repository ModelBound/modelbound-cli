import { Command } from "commander";
import { promises as fs } from "node:fs";
import { callMcpTool, resolveSkillFromPath, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";

interface TestCase {
  id: string;
  name?: string;
  prompt?: string;
}

export function registerTest(p: Command) {
  p.command("test")
    .description("Run a saved test case or ad-hoc prompt against a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--case <id>", "saved test case id")
    .option("--prompt <text>", "ad-hoc prompt (uses local skill file body)")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const cwd = process.cwd();
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(cwd, opts.skill, mcpOpts);
      const args: Record<string, string> = { skill_id: skillId };

      if (opts.case) {
        args.test_case_id = opts.case;
      } else if (opts.prompt) {
        const target = resolveSkillFromPath(cwd, opts.skill);
        const skill_md = await fs.readFile(target.absolutePath, "utf8");
        args.prompt = opts.prompt;
        args.skill_md = skill_md;
      } else {
        const cases = await callMcpTool(
          "list_skill_test_cases",
          { skill_id: skillId },
          { ...mcpOpts, aliases: ["skill.testCases"] },
        ) as { test_cases?: TestCase[] };
        const first = cases.test_cases?.[0];
        if (!first) {
          throw new Error("No saved test cases. Pass --case <id> or --prompt \"…\".");
        }
        args.test_case_id = first.id;
      }

      const r = await callMcpTool("run_skill_test", args, { ...mcpOpts, aliases: ["skill.test"] });
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
