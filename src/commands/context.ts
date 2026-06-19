import { Command } from "commander";
import * as path from "node:path";
import { setWorkspaceContext } from "../core/skill.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

export function registerContext(p: Command) {
  const ctx = p.command("context").description("Workspace scoping for MCP skill operations");

  ctx.command("set")
    .description("Set workspace context (repo + file hints) before skill ops")
    .option("--repo <name>", "org/repo (auto-detected from git remote if omitted)")
    .option("--path <dir>", "workspace root", process.cwd())
    .action(async (opts, cmd) => {
      const g = globalOpts(cmd);
      const cwd = path.resolve(opts.path);
      const r = await setWorkspaceContext(cwd, { profile: p.opts().profile, mcpUrl: g.mcpUrl, repo: opts.repo });
      if (g.json) return printJson(r);
      printSuccess(`Workspace context set for ${cwd}${opts.repo ? ` · ${opts.repo}` : ""}`);
    });
}
