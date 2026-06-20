import { Command } from "commander";
import pc from "picocolors";
import { promises as fs } from "node:fs";
import {
  callMcpTool,
  ensureSkillSynced,
  resolveSkillFromPath,
  resolveSkillId,
  setWorkspaceContext,
} from "../core/skill.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

interface TestCase {
  id: string;
  name?: string;
  prompt?: string;
  notes?: string;
  created_at?: string;
}

function mcpOpts(cmd: Command, profile: string) {
  const g = globalOpts(cmd);
  return { profile, mcpUrl: g.mcpUrl, json: g.json };
}

async function runSkillTest(
  cwd: string,
  opts: { skill: string; case?: string; prompt?: string },
  profile: string,
  mcpUrl?: string,
): Promise<unknown> {
  const mcpOpts = { profile, mcpUrl };
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
      throw new Error(
        'No saved test cases. Run `modelbound test create --skill ... --name "..." --prompt "..."` or pass --prompt "…".',
      );
    }
    args.test_case_id = first.id;
  }

  return callMcpTool("run_skill_test", args, { ...mcpOpts, aliases: ["skill.test"] });
}

export function registerTest(p: Command) {
  const t = p.command("test").description("Skill automated checks (create, list, run, seed)");

  t.command("run")
    .description("Run a saved test case or ad-hoc prompt against a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--case <id>", "saved test case id")
    .option("--prompt <text>", "ad-hoc prompt (uses local skill file body)")
    .action(async (opts, cmd) => {
      const profile = p.opts().profile ?? "default";
      const g = mcpOpts(cmd, profile);
      const r = await runSkillTest(process.cwd(), opts, profile, g.mcpUrl);
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  t.command("create")
    .description("Create a saved automated check test case for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .requiredOption("--name <name>", "short name for the check")
    .requiredOption("--prompt <text>", "user prompt sent to the model during the test")
    .option("--notes <text>", "expected behavior / grading notes")
    .option("--repo <name>", "org/repo override for workspace scoping")
    .action(async (opts, cmd) => {
      const profile = p.opts().profile ?? "default";
      const g = mcpOpts(cmd, profile);
      const cwd = process.cwd();
      await setWorkspaceContext(cwd, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });
      const skillId = await ensureSkillSynced(cwd, opts.skill, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });

      const r = await callMcpTool(
        "create_skill_test_case",
        {
          skill_id: skillId,
          name: opts.name,
          prompt: opts.prompt,
          ...(opts.notes ? { notes: opts.notes } : {}),
        },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skills.createTestCase", "skill.createTestCase"] },
      ) as { test_case?: TestCase };

      const tc = r?.test_case;
      if (g.json) return printJson(r);
      printSuccess(`Test case created${tc?.name ? `: ${tc.name}` : ""}${tc?.id ? ` (${tc.id})` : ""}`);
    });

  t.command("list")
    .description("List saved test cases for a skill")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .action(async (opts, cmd) => {
      const profile = p.opts().profile ?? "default";
      const g = mcpOpts(cmd, profile);
      const skillId = await resolveSkillId(process.cwd(), opts.skill, { profile, mcpUrl: g.mcpUrl });
      const r = await callMcpTool(
        "list_skill_test_cases",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skill.testCases"] },
      ) as { test_cases?: TestCase[] };

      if (g.json) return printJson(r);
      const cases = r?.test_cases ?? [];
      if (!cases.length) {
        process.stdout.write("(no test cases — run `modelbound test create`)\n");
        return;
      }
      for (const c of cases) {
        process.stdout.write(
          `  ${pc.cyan(c.id)}  ${c.name ?? "(unnamed)"}${c.prompt ? pc.dim(` · ${c.prompt.slice(0, 60)}${c.prompt.length > 60 ? "…" : ""}`) : ""}\n`,
        );
      }
    });

  t.command("seed")
    .description("Create test case + pipeline body snapshot for a new skill (one-shot setup)")
    .requiredOption("--skill <target>", "skill file path, slug, or UUID")
    .option("--name <name>", "test case name", "PR summary draft")
    .option("--prompt <text>", "test case prompt", "Draft a PR summary for a sync bugfix in the ModelBound Claude Code plugin.")
    .option("--notes <text>", "expected behavior notes", "Should describe the bug, the fix, and list test steps.")
    .option("--repo <name>", "org/repo override")
    .option("--no-pipeline", "skip pipeline run (test case only)")
    .action(async (opts, cmd) => {
      const profile = p.opts().profile ?? "default";
      const g = mcpOpts(cmd, profile);
      const cwd = process.cwd();
      await setWorkspaceContext(cwd, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });
      const skillId = await ensureSkillSynced(cwd, opts.skill, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });

      const existing = await callMcpTool(
        "list_skill_test_cases",
        { skill_id: skillId },
        { profile, mcpUrl: g.mcpUrl, aliases: ["skill.testCases"] },
      ) as { test_cases?: TestCase[] };

      let testCaseId = existing?.test_cases?.[0]?.id;
      if (!testCaseId) {
        const created = await callMcpTool(
          "create_skill_test_case",
          {
            skill_id: skillId,
            name: opts.name,
            prompt: opts.prompt,
            notes: opts.notes,
          },
          { profile, mcpUrl: g.mcpUrl, aliases: ["skills.createTestCase", "skill.createTestCase"] },
        ) as { test_case?: TestCase };
        testCaseId = created?.test_case?.id;
      }

      let pipelineRun: { run_id?: string; id?: string; version_after?: string } | undefined;
      if (opts.pipeline !== false) {
        pipelineRun = await callMcpTool(
          "run_skill_pipeline",
          {
            skill_id: skillId,
            stage: "test_optimize",
            targets: ["save"],
            changelog: null,
            version_bump: "patch",
            override_gate: false,
          },
          { profile, mcpUrl: g.mcpUrl, aliases: ["skills.runPipeline"] },
        ) as typeof pipelineRun;
      }

      const out = {
        skill_id: skillId,
        test_case_id: testCaseId,
        pipeline_run_id: pipelineRun?.run_id ?? pipelineRun?.id,
        version_after: pipelineRun?.version_after,
      };
      if (g.json) return printJson(out);
      printSuccess(`Seeded ${opts.skill} → skill ${skillId}`);
      if (testCaseId) process.stdout.write(`  test case: ${testCaseId}\n`);
      if (pipelineRun?.run_id ?? pipelineRun?.id) {
        process.stdout.write(`  pipeline: ${pipelineRun.run_id ?? pipelineRun.id} → ${pipelineRun.version_after ?? "—"}\n`);
      }
    });
}
