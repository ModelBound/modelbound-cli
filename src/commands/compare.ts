import { Command } from "commander";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson } from "../lib/render.js";

function normalizeVersion(label: string): string {
  return String(label).replace(/^v/i, "");
}

export { normalizeVersion };

type VersionRow = { version?: string | number; label?: string };

async function recentVersionLabels(
  skillId: string,
  mcpOpts: { profile?: string; mcpUrl?: string },
): Promise<string[]> {
  const raw = await callMcpTool(
    "get_file_variants",
    { file_id: skillId, skill_id: skillId, limit: 10 },
    { ...mcpOpts, aliases: ["skill.versions"] },
  ) as { versions?: VersionRow[]; variants?: VersionRow[] };
  const rows = raw.versions?.length ? raw.versions : raw.variants ?? [];
  return rows
    .map((r) => normalizeVersion(String(r.version ?? r.label ?? "")))
    .filter(Boolean);
}

/** Backend treats literal "latest" as broken (looks up "vlatest"); resolve locally. */
async function resolveCompareLabels(
  skillId: string,
  from: string,
  to: string,
  mcpOpts: { profile?: string; mcpUrl?: string },
): Promise<{ from: string; to: string }> {
  let resolvedFrom = normalizeVersion(from);
  let resolvedTo = normalizeVersion(to);
  if (resolvedFrom !== "latest" && resolvedTo !== "latest") {
    return { from: resolvedFrom, to: resolvedTo };
  }
  const labels = await recentVersionLabels(skillId, mcpOpts);
  if (resolvedFrom === "latest") {
    resolvedFrom = labels[0] ?? resolvedFrom;
  }
  if (resolvedTo === "latest") {
    resolvedTo = labels[0] ?? resolvedTo;
  }
  return { from: resolvedFrom, to: resolvedTo };
}

export function registerCompare(p: Command) {
  p.command("compare")
    .description("Compare two skill versions")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--from <version>", "source version label", "latest")
    .option("--to <version>", "target version label", "current")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const mcpOpts = { profile, mcpUrl: g.mcpUrl };
      const skillId = await resolveSkillId(process.cwd(), opts.skill, mcpOpts);
      const { from, to } = await resolveCompareLabels(skillId, opts.from, opts.to, mcpOpts);
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
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
