import { Command } from "commander";
import pc from "picocolors";
import { callMcpTool } from "../core/skill.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

export function registerEval(p: Command) {
  const ev = p.command("eval").description("Eval test suite (create, list, run, results)");

  ev.command("create")
    .description("Create a new eval test case")
    .requiredOption("--name <name>", "case name")
    .requiredOption("--prompt <text>", "input prompt sent to the skill")
    .option("--description <text>", "optional description")
    .option("--expected <text>", "expected output")
    .option("--rubric <text>", "scoring rubric for AI judge")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const r = await callMcpTool(
        "create_eval_case",
        {
          name: opts.name,
          input_prompt: opts.prompt,
          description: opts.description,
          expected_output: opts.expected,
          rubric: opts.rubric,
        },
        { profile, mcpUrl: g.mcpUrl, aliases: ["evals.createCase"] },
      );
      if (g.json) return printJson(r);
      printSuccess(`Eval case created: ${opts.name}`);
    });

  ev.command("list")
    .description("List eval cases for the team")
    .action(async (_opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const r = await callMcpTool("list_eval_cases", {}, { profile, mcpUrl: g.mcpUrl, aliases: ["evals.listCases"] });
      if (g.json) return printJson(r);
      const cases = (r as { cases?: unknown[] })?.cases ?? (Array.isArray(r) ? r : []);
      if (!cases.length) {
        process.stdout.write("(no eval cases)\n");
        return;
      }
      for (const c of cases as Array<{ id?: string; name?: string }>) {
        process.stdout.write(`  ${pc.cyan(c.id?.slice(0, 8) ?? "—")}  ${c.name ?? "(unnamed)"}\n`);
      }
    });

  ev.command("run")
    .description("Score actual output against an eval case")
    .requiredOption("--case <id>", "eval case id")
    .requiredOption("--output <text>", "actual output to score")
    .option("--score <n>", "manual score 0-100", parseFloat)
    .option("--pass", "mark as pass")
    .option("--fail", "mark as fail")
    .option("--judge <type>", "manual | ai | automated", "manual")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const args: Record<string, unknown> = {
        eval_case_id: opts.case,
        actual_output: opts.output,
        judge_type: opts.judge,
      };
      if (opts.score != null) args.score = opts.score;
      if (opts.pass) args.pass = true;
      if (opts.fail) args.pass = false;
      const r = await callMcpTool("run_eval", args, { profile, mcpUrl: g.mcpUrl, aliases: ["evals.run"] });
      if (g.json) return printJson(r);
      printSuccess("Eval run submitted.");
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  ev.command("results")
    .description("List eval run history")
    .option("--case <id>", "filter by eval case id")
    .option("--limit <n>", "max results", "50")
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const r = await callMcpTool(
        "list_eval_results",
        { eval_case_id: opts.case, limit: Number(opts.limit) },
        { profile, mcpUrl: g.mcpUrl, aliases: ["evals.listResults"] },
      );
      if (g.json) return printJson(r);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
