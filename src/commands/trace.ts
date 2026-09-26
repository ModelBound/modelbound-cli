import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";

const ENDPOINT = process.env.MODELBOUND_TRACE_ENDPOINT ?? "https://api.modelbound.co/functions/v1/trace-ingest";

/**
 * `mb trace` — run any command and record it as a traced run for a skill.
 *
 *   mb trace --skill deploy-checklist -- npm run deploy
 *
 * Sends a summary only: command name, duration, exit status. Never output.
 */
export function registerTrace(program: Command) {
  program
    .command("trace")
    .description("Run a command and record it as a traced run for a skill (summary only)")
    .requiredOption("--skill <slugOrId>", "Skill slug or UUID this run used")
    .option("--version <v>", "Skill version tag")
    .option("--name <name>", "Run name (defaults to the command)")
    .option("--category <c>", "Failure category if it fails, e.g. wrong_tool")
    .argument("<cmd...>", "Command to run (after --)")
    .action(async (cmd: string[], opts: { skill: string; version?: string; name?: string; category?: string }) => {
      const key = process.env.MODELBOUND_API_KEY;
      const started = Date.now();
      const code: number = await new Promise((resolve) => {
        const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
        child.on("exit", (c) => resolve(c ?? 1));
        child.on("error", () => resolve(127));
      });
      const isUuid = /^[0-9a-f-]{36}$/i.test(opts.skill);
      const status = code === 0 ? "ok" : "error";
      if (!key) {
        console.error(chalk.yellow("MODELBOUND_API_KEY not set — run not recorded."));
      } else {
        try {
          const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key },
            body: JSON.stringify({
              runs: [{
                trace_id: `cli-${started}`,
                name: opts.name ?? cmd[0],
                source: "modelbound-cli",
                spans: [{
                  name: cmd[0],
                  kind: "tool",
                  duration_ms: Date.now() - started,
                  status,
                  error_category: status === "error" ? opts.category : undefined,
                  skill_id: isUuid ? opts.skill : undefined,
                  skill_slug: isUuid ? undefined : opts.skill,
                  skill_version: opts.version,
                }],
              }],
            }),
          });
          console.error(res.ok ? chalk.dim(`Traced run recorded for ${opts.skill}.`) : chalk.yellow(`Trace not recorded (HTTP ${res.status}).`));
        } catch {
          console.error(chalk.yellow("Trace not recorded (network error)."));
        }
      }
      process.exit(code);
    });
}
