#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { registerAuth, runAuthLogin, runAuthLogout, runAuthStatus } from "./commands/auth.js";
import { registerOptimize } from "./commands/optimize.js";
import { registerPipeline } from "./commands/pipeline.js";
import { registerTest } from "./commands/test.js";
import { registerVersion } from "./commands/version.js";
import { registerBackup } from "./commands/backup.js";
import { registerSync } from "./commands/sync.js";
import { registerRepo } from "./commands/repo.js";
import { registerConfig } from "./commands/config.js";
import { registerMcp } from "./commands/mcp.js";
import { registerContext } from "./commands/context.js";
import { registerFindings } from "./commands/findings.js";
import { registerBenchmark } from "./commands/benchmark.js";
import { registerCompare } from "./commands/compare.js";
import { registerSuggest } from "./commands/suggest.js";
import { registerEval } from "./commands/eval.js";
import { registerHealth } from "./commands/health.js";

const program = new Command();

program
  .name("modelbound")
  .description("ModelBound CLI — token optimization, skill pipeline, and version management")
  .version("0.3.0")
  .option("--json", "machine-readable output (NDJSON for streams)")
  .option("--quiet", "suppress progress output")
  .option("--no-color", "disable ANSI color")
  .option("--profile <name>", "named profile to use", "default")
  .option("--mcp-url <url>", "hosted MCP endpoint", process.env.MODELBOUND_MCP_URL);

registerAuth(program);
registerContext(program);
registerOptimize(program);
registerPipeline(program);
registerTest(program);
registerBenchmark(program);
registerCompare(program);
registerSuggest(program);
registerFindings(program);
registerEval(program);
registerVersion(program);
registerBackup(program);
registerSync(program);
registerRepo(program);
registerConfig(program);
registerMcp(program);
registerHealth(program);

// Top-level auth aliases (extension parity)
program
  .command("login")
  .description("Sign in (alias for auth login)")
  .option("--api-key <key>", "store an mb_live_ key directly")
  .action(async (opts) => {
    await runAuthLogin(program.opts().profile ?? "default", opts.apiKey);
  });

program
  .command("logout")
  .description("Sign out (alias for auth logout)")
  .action(async () => {
    await runAuthLogout(program.opts().profile ?? "default");
  });

program
  .command("whoami")
  .description("Show auth status (alias for auth status)")
  .action(async () => {
    await runAuthStatus(program.opts().profile ?? "default");
  });

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(pc.red("✖ ") + (err?.message ?? String(err)));
  process.exit(1);
});
