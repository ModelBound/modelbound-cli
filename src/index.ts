#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { registerAuth } from "./commands/auth.js";
import { registerOptimize } from "./commands/optimize.js";
import { registerPipeline } from "./commands/pipeline.js";
import { registerTest } from "./commands/test.js";
import { registerVersion } from "./commands/version.js";
import { registerBackup } from "./commands/backup.js";
import { registerSync } from "./commands/sync.js";
import { registerRepo } from "./commands/repo.js";
import { registerConfig } from "./commands/config.js";
import { registerMcp } from "./commands/mcp.js";

const program = new Command();

program
  .name("modelbound")
  .description("ModelBound CLI — token optimization, skill pipeline, and version management")
  .version("0.1.0")
  .option("--json", "machine-readable output (NDJSON for streams)")
  .option("--quiet", "suppress progress output")
  .option("--no-color", "disable ANSI color")
  .option("--profile <name>", "named profile to use", "default");

registerAuth(program);
registerOptimize(program);
registerPipeline(program);
registerTest(program);
registerVersion(program);
registerBackup(program);
registerSync(program);
registerRepo(program);
registerConfig(program);
registerMcp(program);

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(pc.red("✖ ") + (err?.message ?? String(err)));
  process.exit(1);
});
