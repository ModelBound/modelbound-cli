import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";
import { printSummary } from "../ui/summary.js";

export function registerVersion(p: Command) {
  const v = p.command("version").description("File version management");

  v.command("list")
    .description("List versions for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "get_file_variants",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skill.versions"] },
      ) as { versions?: Array<{ version?: string | number; created_at?: string; note?: string }> };
      if (g.json) return printJson(r);
      for (const it of r.versions ?? []) {
        process.stdout.write(`v${it.version}${it.created_at ? "  " + it.created_at : ""}${it.note ? "  " + it.note : ""}\n`);
      }
    });

  v.command("diff")
    .description("Diff two versions of a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .requiredOption("--from <version>", "source version")
    .option("--to <version>", "target version (live if omitted)")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const args: Record<string, string> = { skill_id: skillId, from_version: opts.from, mode: "diff" };
      if (opts.to) args.to_version = opts.to;
      const r = await callMcpTool("get_file_variants", args, { profile, mcpUrl: g.mcpUrl, aliases: ["skill.diff"] });
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  v.command("restore")
    .description("Restore a prior version (creates a new backup of current first)")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .requiredOption("--version <label>", "version label to restore")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "get_file_variants",
        { skill_id: skillId, action: "restore", version: opts.version },
        { profile, mcpUrl: g.mcpUrl },
      ) as { new_version?: string };
      printSummary({
        ok: true,
        title: `Restored v${opts.version} of ${opts.skill}`,
        meta: r.new_version ? `new version ${r.new_version}` : undefined,
      }, !!g.json);
    });

  // Top-level alias matching extension naming
  p.command("versions")
    .description("List versions for a skill (alias for version list)")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "get_file_variants",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skill.versions"] },
      ) as { versions?: Array<{ version?: string | number; created_at?: string; note?: string }> };
      if (g.json) return printJson(r);
      for (const it of r.versions ?? []) {
        process.stdout.write(`v${it.version}${it.created_at ? "  " + it.created_at : ""}${it.note ? "  " + it.note : ""}\n`);
      }
    });
}
