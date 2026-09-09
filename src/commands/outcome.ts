import { Command } from "commander";
import chalk from "chalk";
import { api } from "../lib/api.js";
import { printJson } from "../lib/render.js";

const VERDICTS = ["worked", "partial", "failed"] as const;
const CATEGORIES = [
  "ignored_rule",
  "out_of_scope",
  "wrong_tool",
  "hallucinated",
  "wrong_format",
  "too_vague",
  "other",
] as const;

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
};

/**
 * `mb report` closes the loop between using a skill and improving it.
 * Everything else in the CLI acts on a skill before it runs; this records
 * what happened after.
 */
export function registerOutcome(program: Command): void {
  program
    .command("report <slug>")
    .description("Report how a skill performed (worked | partial | failed)")
    .requiredOption("--verdict <verdict>", VERDICTS.join(" | "))
    .option("--category <category>", CATEGORIES.join(" | "))
    .option("--note <note>", "one sentence on what happened")
    .option("--paste", "read the bad output from stdin as the excerpt", false)
    .action(async (slug: string, opts: Record<string, unknown>) => {
      const verdict = String(opts.verdict).toLowerCase();
      if (!VERDICTS.includes(verdict as (typeof VERDICTS)[number])) {
        throw new Error(`--verdict must be one of: ${VERDICTS.join(", ")}`);
      }
      const category = opts.category ? String(opts.category).toLowerCase() : undefined;
      if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
        throw new Error(`--category must be one of: ${CATEGORIES.join(", ")}`);
      }
      const output_excerpt = opts.paste ? (await readStdin()).slice(0, 4000) : undefined;

      const res = await api<{ outcome_id: string; verdict: string; category: string | null }>(
        "/api/cli/skill/outcome",
        {
          method: "POST",
          body: { slug, verdict, category, note: opts.note, output_excerpt, source: "cli" },
        },
      );
      if (program.opts().json) return printJson(res);
      // eslint-disable-next-line no-console
      console.log(
        chalk.green("recorded ") +
          `${res.verdict}${res.category ? ` (${res.category})` : ""} for ${slug}` +
          chalk.dim("\nSee suggested fixes at https://modelbound.co/skills/attention"),
      );
    });

  program
    .command("reliability")
    .description("Show which skills work in real use and which need attention")
    .option("--days <days>", "rolling window, default 30", "30")
    .action(async (opts: Record<string, unknown>) => {
      const res = await api<{
        days: number;
        skills: Array<{
          skill_id: string;
          slug: string | null;
          reports: number;
          worked: number;
          partial: number;
          failed: number;
          reliability: number | null;
        }>;
      }>(`/api/cli/skill/reliability?days=${encodeURIComponent(String(opts.days))}`);
      if (program.opts().json) return printJson(res);
      if (!res.skills.length) {
        // eslint-disable-next-line no-console
        console.log(chalk.dim("No outcome reports yet. Record one with: mb report <slug> --verdict failed"));
        return;
      }
      for (const s of res.skills) {
        const score =
          s.reports < 3 || s.reliability == null
            ? chalk.dim(`${s.reports} report(s), too few to score`)
            : s.reliability >= 80
              ? chalk.green(`${s.reliability}% reliable`)
              : s.reliability >= 50
                ? chalk.yellow(`${s.reliability}% reliable`)
                : chalk.red(`${s.reliability}% reliable`);
        // eslint-disable-next-line no-console
        console.log(`${(s.slug ?? s.skill_id).padEnd(32)} ${score}  ${chalk.dim(`${s.failed} failed, ${s.partial} partial`)}`);
      }
    });
}
