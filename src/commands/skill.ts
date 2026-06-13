// `mb skill {test,benchmark,versions,restore,diff}` — version + eval ops.
// Mirrors the cloud `skill.*` MCP tools.
import { Command } from "commander";
import ora from "ora";
import { api } from "../lib/api.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

export function registerSkill(program: Command): void {
  const skill = program.command("skill").description("Skill version + evaluation operations.");

  skill
    .command("test <skill>")
    .description("Run the test suite for a skill.")
    .option("--version <id>", "test a specific version")
    .option("--model <name>", "model to evaluate against")
    .action(async (slug: string, opts: { version?: string; model?: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const spinner = g.json ? null : ora("Running tests…").start();
      const res = await api<{ pass_rate: number; passed: number; failed: number; cost_usd: number; tokens: number }>(
        "/api/cli/skill/test",
        {
          method: "POST",
          apiUrl: g.apiUrl,
          body: { slug, version_id: opts.version, model: opts.model },
        },
      );
      spinner?.stop();
      if (g.json) return printJson(res);
      printSuccess(
        `Pass rate ${(res.pass_rate * 100).toFixed(1)}% — ${res.passed}/${res.passed + res.failed} ` +
          `(${res.tokens} tokens, $${res.cost_usd.toFixed(4)})`,
      );
      if (res.failed > 0) process.exit(2);
    });

  skill
    .command("benchmark <skill>")
    .description("Head-to-head benchmark of two versions.")
    .requiredOption("--a <version>", "version A (or 'current')")
    .requiredOption("--b <version>", "version B (or 'baseline')")
    .action(async (slug: string, opts: { a: string; b: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const spinner = g.json ? null : ora("Benchmarking…").start();
      const res = await api<{
        a: { tokens: number; cost_usd: number; pass_rate: number; latency_ms: number };
        b: { tokens: number; cost_usd: number; pass_rate: number; latency_ms: number };
        winner: "a" | "b" | "tie";
      }>("/api/cli/skill/benchmark", {
        method: "POST",
        apiUrl: g.apiUrl,
        body: { slug, version_a: opts.a, version_b: opts.b },
      });
      spinner?.stop();
      if (g.json) return printJson(res);
      // eslint-disable-next-line no-console
      console.log(`  A (${opts.a}): ${res.a.tokens} tok, $${res.a.cost_usd.toFixed(4)}, ${(res.a.pass_rate * 100).toFixed(1)}% pass, ${res.a.latency_ms}ms`);
      // eslint-disable-next-line no-console
      console.log(`  B (${opts.b}): ${res.b.tokens} tok, $${res.b.cost_usd.toFixed(4)}, ${(res.b.pass_rate * 100).toFixed(1)}% pass, ${res.b.latency_ms}ms`);
      printSuccess(`Winner: ${res.winner.toUpperCase()}`);
    });

  skill
    .command("versions <skill>")
    .description("List versions newest-first.")
    .option("--limit <n>", "max versions to show", "20")
    .action(async (slug: string, opts: { limit: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const res = await api<{ versions: Array<{ id: string; created_at: string; author?: string; tokens: number; summary?: string }> }>(
        `/api/cli/skill/versions?slug=${encodeURIComponent(slug)}&limit=${encodeURIComponent(opts.limit)}`,
        { apiUrl: g.apiUrl },
      );
      if (g.json) return printJson(res);
      for (const v of res.versions) {
        // eslint-disable-next-line no-console
        console.log(`  ${v.id}  ${v.created_at}  ${v.tokens}tok  ${v.author ?? "—"}  ${v.summary ?? ""}`);
      }
    });

  skill
    .command("restore <skill> <versionId>")
    .description("Restore the skill to a previous version (non-destructive).")
    .action(async (slug: string, versionId: string, _opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const res = await api<{ new_version_id: string }>("/api/cli/skill/restore", {
        method: "POST",
        apiUrl: g.apiUrl,
        body: { slug, version_id: versionId },
      });
      if (g.json) return printJson(res);
      printSuccess(`Restored. New version: ${res.new_version_id}`);
    });

  skill
    .command("diff <skill>")
    .description("Unified diff between two versions.")
    .requiredOption("--from <ver>", "from version (ID, 'baseline', or 'previous')")
    .option("--to <ver>", "to version (ID or 'current')", "current")
    .action(async (slug: string, opts: { from: string; to: string }, cmd: Command) => {
      const g = globalOpts(cmd);
      const res = await api<{ diff: string }>(
        `/api/cli/skill/diff?slug=${encodeURIComponent(slug)}&from=${encodeURIComponent(opts.from)}&to=${encodeURIComponent(opts.to)}`,
        { apiUrl: g.apiUrl },
      );
      if (g.json) return printJson(res);
      // eslint-disable-next-line no-console
      console.log(res.diff);
    });
}
