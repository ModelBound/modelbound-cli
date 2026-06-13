// Tiny helpers for rendering output consistently across commands.
// All commands honor a top-level `--json` flag for scripting.
import chalk from "chalk";
import { Command } from "commander";

export interface GlobalOpts {
  json?: boolean;
  apiUrl?: string;
}

export function globalOpts(cmd: Command): GlobalOpts {
  // Commander stores options on the root program when defined there.
  const root = cmd.parent ?? cmd;
  return root.opts() as GlobalOpts;
}

export function printJson(value: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(value, null, 2));
}

export function printSuccess(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(chalk.green("✓ ") + msg);
}

export function printInfo(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(chalk.cyan("→ ") + msg);
}

export function printWarn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(chalk.yellow("! ") + msg);
}

export function die(msg: string, code = 1): never {
  // eslint-disable-next-line no-console
  console.error(chalk.red("error: ") + msg);
  process.exit(code);
}
