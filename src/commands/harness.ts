import { Command } from "commander";
import chalk from "chalk";
import { api } from "../lib/api.js";
import { printJson } from "../lib/render.js";

type CheckStatus = "pass" | "warn" | "fail";

interface HarnessCheck {
  id: string;
  pillar: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

interface HarnessResult {
  status: CheckStatus;
  score: number;
  summary: string;
  pillars: Record<string, CheckStatus>;
  checks: HarnessCheck[];
}

const mark = (s: CheckStatus) =>
  s === "pass" ? chalk.green("PASS") : s === "warn" ? chalk.yellow("WARN") : chalk.red("FAIL");

/**
 * `mb harness` — one-shot "can this run unattended?".
 *
 * Reads the Safety result from the skill's latest pipeline run. Exits non-zero
 * on a failing gate so CI can block a release.
 */
export function registerHarness(program: Command) {
  program
    .command("harness <slug>")
    .description("Check whether a skill is cleared to run unattended (context, permissions, guardrails, verification)")
    .option("--json", "Output raw JSON")
    .option("--strict", "Exit non-zero on cautions as well as failures")
    .action(async (slug: string, opts: { json?: boolean; strict?: boolean }) => {
      const run = await api<any>(`/api/cli/skill/pipeline?skill_id=${encodeURIComponent(slug)}`);
      const safety: HarnessResult | null = run?.stage_results?.test?.details?.safety ?? null;

      if (!safety) {
        if (opts.json) {
          printJson({ status: "unknown", ready: false });
        } else {
          console.log(chalk.yellow("No harness result yet."));
          console.log(`Run ${chalk.cyan(`mb pipeline ${slug}`)} first.`);
        }
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        printJson(safety);
      } else {
        const header =
          safety.status === "fail"
            ? chalk.red("Supervised only")
            : safety.status === "warn"
              ? chalk.yellow("Ready with cautions")
              : chalk.green("Ready for unattended runs");
        console.log(`\n${header}  ${chalk.dim(`${safety.score}%`)}`);
        console.log(chalk.dim(safety.summary));
        console.log("");
        for (const pillar of ["context", "permissions", "guardrails", "verification"]) {
          console.log(`  ${mark(safety.pillars?.[pillar] ?? "pass")}  ${pillar}`);
        }
        console.log("");
        for (const check of safety.checks ?? []) {
          if (check.status === "pass") continue;
          console.log(`  ${mark(check.status)}  ${check.label}`);
          console.log(`        ${chalk.dim(check.detail)}`);
          if (check.fix) console.log(`        ${chalk.cyan(check.fix)}`);
        }
      }

      if (safety.status === "fail" || (opts.strict && safety.status === "warn")) {
        process.exitCode = 1;
      }
    });
}
