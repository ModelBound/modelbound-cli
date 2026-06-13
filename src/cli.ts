#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { registerAuth } from "./commands/auth.js";
import { registerOptimize } from "./commands/optimize.js";
import { registerPipeline } from "./commands/pipeline.js";
import { registerSkill } from "./commands/skill.js";
import { registerHealth } from "./commands/health.js";

const program = new Command();

program
  .name("mb")
  .description(
    "ModelBound CLI — token optimization, Skill Development Pipeline,\n" +
      "test, benchmark, versions, and restore for agent skills.",
  )
  .version("0.1.0")
  .option("--json", "machine-readable JSON output", false)
  .option("--api-url <url>", "override API base URL")
  .showHelpAfterError();

registerAuth(program);
registerOptimize(program);
registerPipeline(program);
registerSkill(program);
registerHealth(program);

program.parseAsync(process.argv).catch((err: Error) => {
  // eslint-disable-next-line no-console
  console.error(chalk.red("error: ") + err.message);
  process.exit(1);
});
