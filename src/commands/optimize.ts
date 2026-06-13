// `mb optimize`, `mb suggestions`, `mb apply` — token optimization commands.
//
// These mirror the cloud `optimization.*` MCP tools exactly so that whether
// you call from Cursor's MCP, the CLI, or CI you get identical behavior.
import { Command } from "commander";
import ora from "ora";
import fs from "node:fs";
import { api } from "../lib/api.js";
import { die, globalOpts, printJson, printSuccess } from "../lib/render.js";

interface OptimizeResult {
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  savings_pct: number;
  diff?: string;
  version_id?: string;
}

export function registerOptimize(program: Command): void {
  program
    .command("optimize <target>")
    .description(
      "Run token optimization on a skill (slug or ID) or a local file path.\n" +
        "Without --apply, prints a diff and savings estimate.",
    )
    .option("--apply", "save the optimized version (creates a new version)", false)
    .option("--strategy <s>", "balanced | aggressive | structure-only", "balanced")
    .action(async (target: string, opts: { apply: boolean; strategy: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const spinner = g.json ? null : ora("Optimizing…").start();
      try {
        const body: Record<string, unknown> = {
          strategy: opts.strategy,
          apply: opts.apply,
        };
        // If `target` looks like a path that exists, send file contents.
        // Otherwise treat as a slug/ID.
        if (target.includes("/") || target.endsWith(".md") || target.endsWith(".mdc")) {
          if (!fs.existsSync(target)) die(`File not found: ${target}`);
          body.content = fs.readFileSync(target, "utf-8");
          body.filename = target;
        } else {
          body.slug = target;
        }
        const result = await api<OptimizeResult>("/api/cli/optimize", {
          method: "POST",
          apiUrl: g.apiUrl,
          body,
        });
        spinner?.stop();
        if (g.json) return printJson(result);
        if (result.tokens_saved <= 0) {
          printSuccess("Already optimized — no significant savings.");
          return;
        }
        printSuccess(
          `Saved ${result.tokens_saved.toLocaleString()} tokens ` +
            `(${result.savings_pct}%, ${result.tokens_before}→${result.tokens_after}).`,
        );
        if (result.diff) {
          // eslint-disable-next-line no-console
          console.log("\n" + result.diff);
        }
        if (opts.apply && result.version_id) {
          printSuccess(`New version: ${result.version_id}`);
        }
      } catch (e) {
        spinner?.fail(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });

  program
    .command("suggestions")
    .description("List pending optimization suggestions.")
    .option("--file <id>", "limit to a specific file")
    .option("--severity <s>", "info | warning | high")
    .action(async (opts: { file?: string; severity?: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const params = new URLSearchParams();
      if (opts.file) params.set("file_id", opts.file);
      if (opts.severity) params.set("severity", opts.severity);
      const q = params.toString();
      const res = await api<{ suggestions: Array<{ id: string; title: string; severity: string; file_id: string }> }>(
        `/api/cli/optimize/suggestions${q ? `?${q}` : ""}`,
        { apiUrl: g.apiUrl },
      );
      if (g.json) return printJson(res);
      if (!res.suggestions?.length) {
        printSuccess("No pending suggestions.");
        return;
      }
      for (const s of res.suggestions) {
        // eslint-disable-next-line no-console
        console.log(`  [${s.severity}] ${s.id}  ${s.title}  (${s.file_id})`);
      }
    });

  program
    .command("apply <suggestionIds...>")
    .description("Apply one or more optimization suggestions by ID.")
    .action(async (ids: string[], _opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const res = await api<{ applied: number; new_versions: string[] }>(
        "/api/cli/optimize/apply",
        { method: "POST", apiUrl: g.apiUrl, body: { suggestion_ids: ids } },
      );
      if (g.json) return printJson(res);
      printSuccess(`Applied ${res.applied} suggestion(s). New versions: ${res.new_versions.join(", ")}`);
    });
}
