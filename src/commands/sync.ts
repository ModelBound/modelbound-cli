import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { createClient } from "../core/client.js";
import { backupFile } from "../core/backup.js";
import { ensureSkillSynced, resolveSkillFromPath, setWorkspaceContext } from "../core/skill.js";
import { printSummary } from "../ui/summary.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

const PushResp = z.object({ skill_id: z.string().optional(), version_id: z.string().optional() });
const PullResp = z.object({ content: z.string(), skill_id: z.string().optional(), version_id: z.string().optional() });

export function registerSync(p: Command) {
  p.command("push <path>").description("Push a local skill file to ModelBound (legacy edge sync)").action(async (filePath: string) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const content = await fs.readFile(path.resolve(filePath), "utf8");
    const r = await client.call("sync-cloud-push", { path: filePath, content }, PushResp);
    printSummary({ ok: true, title: `Pushed ${filePath}`, meta: `cloud version ${r.version_id ?? "—"}` }, !!p.opts().json);
  });

  p.command("pull <skillId>").description("Pull a cloud skill into the current directory (writes backup first)").action(async (skillId: string) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const r = await client.call("sync-cloud-pull", { skill_id: skillId }, PullResp);
    const dest = path.resolve(`${skillId}.md`);
    let token: string | undefined;
    try { token = (await backupFile(dest)).token; } catch { /* file may not exist */ }
    await fs.writeFile(dest, r.content);
    printSummary({
      ok: true,
      title: `Pulled ${skillId} → ${path.basename(dest)}`,
      meta: token ? `backup ${token}` : "no prior local file",
      undo: token ? `modelbound backup restore ${token}` : undefined,
    }, !!p.opts().json);
  });

  p.command("sync [path]")
    .description("Sync a local skill file to cloud via MCP (repo-linked UUID)")
    .option("--file <path>", "skill file to sync (alias for positional path)")
    .option("--repo <name>", "org/repo override")
    .action(async (pathArg: string | undefined, opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const cwd = process.cwd();
      const filePath = opts.file ?? pathArg;

      if (!filePath) {
        process.stdout.write("Usage: modelbound sync --file <path>\n");
        process.stdout.write("       modelbound sync <path>\n");
        process.stdout.write("Also available: modelbound push <path> · modelbound pull <skill-id>\n");
        return;
      }

      const target = resolveSkillFromPath(cwd, filePath);
      await setWorkspaceContext(cwd, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });
      const skillId = await ensureSkillSynced(cwd, filePath, { profile, mcpUrl: g.mcpUrl, repo: opts.repo });
      const out = { skill_id: skillId, path: target.relativePath, slug: target.slug };
      if (g.json) return printJson(out);
      printSuccess(`Synced ${target.relativePath} → ${skillId}`);
    });
}
