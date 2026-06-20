import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";
import { printSummary } from "../ui/summary.js";
import { normalizeVersion } from "./compare.js";

interface VersionRow {
  version?: string | number;
  label?: string;
  created_at?: string;
  note?: string;
}

async function listVersions(
  skillId: string,
  mcpOpts: { profile?: string; mcpUrl?: string },
): Promise<{ versions?: VersionRow[]; variants?: VersionRow[]; count?: number }> {
  // Hosted get_file_variants expects file_id; skill UUID is accepted as file_id.
  return callMcpTool(
    "get_file_variants",
    { file_id: skillId, skill_id: skillId, limit: 50 },
    { ...mcpOpts, aliases: ["skill.versions"] },
  ) as Promise<{ versions?: VersionRow[]; variants?: VersionRow[]; count?: number }>;
}

function formatVersions(payload: { versions?: VersionRow[]; variants?: VersionRow[] }): VersionRow[] {
  if (payload.versions?.length) return payload.versions;
  return payload.variants ?? [];
}

export function registerVersion(p: Command) {
  const v = p.command("version").description("File version management");

  v.command("list")
    .description("List versions for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
      const r = await listVersions(skillId, mcpOpts);
      if (g.json) return printJson(r);
      const rows = formatVersions(r);
      if (!rows.length) {
        process.stdout.write("(no versions yet)\n");
        return;
      }
      for (const it of rows) {
        const label = it.version ?? it.label ?? "—";
        process.stdout.write(`v${label}${it.created_at ? "  " + it.created_at : ""}${it.note ? "  " + it.note : ""}\n`);
      }
    });

  v.command("diff")
    .description("Diff two versions of a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .requiredOption("--from <version>", "source version")
    .option("--to <version>", "target version (current if omitted)", "current")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
      const from = normalizeVersion(opts.from);
      const to = normalizeVersion(opts.to ?? "current");
      const r = await callMcpTool(
        "compare_skill_versions",
        {
          skill_id: skillId,
          from_version: from,
          to_version: to,
          version_a: from,
          version_b: to,
        },
        { ...mcpOpts, aliases: ["skills.compareVersions"] },
      );
      if (g.json) return printJson(r);
      const data = r as { diff?: string; stats?: unknown };
      if (data.diff) process.stdout.write(data.diff + "\n");
      else process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  v.command("restore")
    .description("Restore a prior version (creates a new backup of current first)")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .requiredOption("--version <label>", "version label to restore")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
      const r = await callMcpTool(
        "get_file_variants",
        { file_id: skillId, skill_id: skillId, action: "restore", version: opts.version },
        mcpOpts,
      ) as { new_version?: string };
      printSummary({
        ok: true,
        title: `Restored v${opts.version} of ${opts.skill}`,
        meta: r.new_version ? `new version ${r.new_version}` : undefined,
      }, !!g.json);
    });

  p.command("versions")
    .description("List versions for a skill (alias for version list)")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
      const r = await listVersions(skillId, mcpOpts);
      if (g.json) return printJson(r);
      const rows = formatVersions(r);
      if (!rows.length) {
        process.stdout.write("(no versions yet)\n");
        return;
      }
      for (const it of rows) {
        const label = it.version ?? it.label ?? "—";
        process.stdout.write(`v${label}${it.created_at ? "  " + it.created_at : ""}${it.note ? "  " + it.note : ""}\n`);
      }
    });
}
