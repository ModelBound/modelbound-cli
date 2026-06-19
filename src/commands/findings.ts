import { Command } from "commander";
import pc from "picocolors";
import { callMcpTool, resolveSkillId } from "../core/skill.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

interface Finding {
  class: string;
  message: string;
  severity: string;
  source?: string;
  key: string;
  ignored?: boolean;
}

interface FindingsResponse {
  skill_id: string;
  scores?: {
    total?: number;
    clarity?: number;
    safety?: number;
    fit?: number;
    ai_fit_score?: number;
    ai_fit_reason?: string;
  };
  findings?: Finding[];
  ignored_keys?: string[];
  scanner_version?: string;
  updated_at?: string;
}

function renderFindings(r: FindingsResponse, json?: boolean): void {
  if (json) return printJson(r);
  const scores = r.scores;
  if (scores) {
    process.stdout.write(
      pc.bold(`Trust score: ${scores.total ?? "—"}/100`) +
        pc.dim(` · clarity ${scores.clarity ?? "—"} · safety ${scores.safety ?? "—"} · fit ${scores.fit ?? "—"}`) +
        "\n",
    );
    if (scores.ai_fit_reason) process.stdout.write(pc.dim(`AI fit: ${scores.ai_fit_reason}\n`));
  }
  const findings = r.findings ?? [];
  if (!findings.length) {
    process.stdout.write(pc.green("✓ ") + "No findings\n");
    return;
  }
  for (const f of findings) {
    const sevLower = String(f.severity).toLowerCase();
    const sev = sevLower === "critical" ? pc.red(f.severity)
      : sevLower === "warning" || sevLower === "warn" ? pc.yellow(f.severity)
      : pc.dim(f.severity);
    const ignored = f.ignored ? pc.dim(" [ignored]") : "";
    process.stdout.write(`  ${sev} ${f.class}: ${f.message}${ignored}\n`);
    process.stdout.write(pc.dim(`    key: ${f.key}\n`));
  }
}

export function registerFindings(p: Command) {
  const f = p.command("findings").description("Trust & Safety findings for skills");

  f.command("list")
    .description("List trust findings and scores for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "list_skill_findings",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.listFindings"] },
      ) as FindingsResponse;
      renderFindings(r, g.json);
    });

  f.command("ignore")
    .description("Ignore a trust finding by stable key")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--key <key>", "finding key from list output")
    .option("--class <class>", "finding class (if key omitted)")
    .option("--severity <severity>", "finding severity (if key omitted)")
    .option("--message <message>", "finding message (if key omitted)")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const args: Record<string, string> = { skill_id: skillId };
      if (opts.key) args.finding_key = opts.key;
      else {
        if (!opts.class || !opts.severity || !opts.message) {
          throw new Error("Provide --key or all of --class, --severity, and --message.");
        }
        args.class = opts.class;
        args.severity = opts.severity;
        args.message = opts.message;
      }
      const r = await callMcpTool(
        "ignore_skill_finding",
        args,
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.ignoreFinding"] },
      );
      if (g.json) return printJson(r);
      printSuccess("Finding ignored");
    });

  f.command("unignore")
    .description("Un-ignore a previously ignored finding")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--key <key>", "finding key from list output")
    .option("--class <class>", "finding class (if key omitted)")
    .option("--severity <severity>", "finding severity (if key omitted)")
    .option("--message <message>", "finding message (if key omitted)")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const args: Record<string, string> = { skill_id: skillId };
      if (opts.key) args.finding_key = opts.key;
      else {
        if (!opts.class || !opts.severity || !opts.message) {
          throw new Error("Provide --key or all of --class, --severity, and --message.");
        }
        args.class = opts.class;
        args.severity = opts.severity;
        args.message = opts.message;
      }
      const r = await callMcpTool(
        "unignore_skill_finding",
        args,
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.unignoreFinding"] },
      );
      if (g.json) return printJson(r);
      printSuccess("Finding un-ignored");
    });
}
