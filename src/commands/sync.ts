import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { createClient } from "../core/client.js";
import { backupFile } from "../core/backup.js";
import {
  ensureSkillSynced,
  pullSkillFromCloud,
  resolveSkillFromPath,
  setWorkspaceContext,
} from "../core/skill.js";
import { printSummary } from "../ui/summary.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

const PushResp = z.object({ skill_id: z.string().optional(), version_id: z.string().optional() });

export function registerSync(p: Command) {
  p.command("push <path>").description("Push a local skill file to ModelBound (legacy edge sync)").action(async (filePath: string) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const content = await fs.readFile(path.resolve(filePath), "utf8");
    const r = await client.call("sync-cloud-push", { path: filePath, content }, PushResp);
    printSummary({ ok: true, title: `Pushed ${filePath}`, meta: `cloud version ${r.version_id ?? "—"}` }, !!p.opts().json);
  });

  p.command("pull <skillId>")
    .description("Pull a cloud skill via MCP get_skill (writes backup first)")
    .option("--out <path>", "output file path (default: source_path or <slug|id>.md)")
    .option("--repo <name>", "org/repo override for slug lookup")
    .action(async (skillId: string, opts, cmd) => {
      const g = globalOpts(cmd);
      const profile = p.opts().profile ?? "default";
      const cwd = process.cwd();
      const mcpOpts = { profile, mcpUrl: g.mcpUrl, repo: opts.repo };

      await setWorkspaceContext(cwd, mcpOpts);
      const pulled = await pullSkillFromCloud(skillId, mcpOpts);

      const relDest = opts.out ?? pulled.sourcePath ?? `${pulled.slug ?? pulled.skillId}.md`;
      const dest = path.isAbsolute(relDest) ? relDest : path.resolve(cwd, relDest);

      let token: string | undefined;
      try { token = (await backupFile(dest)).token; } catch { /* file may not exist */ }
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, pulled.content);

      const out = {
        skill_id: pulled.skillId,
        path: path.relative(cwd, dest).replace(/\\/g, "/"),
        slug: pulled.slug,
        backup: token,
      };
      if (g.json) return printJson(out);
      printSummary({
        ok: true,
        title: `Pulled ${skillId} → ${path.basename(dest)}`,
        meta: token ? `backup ${token}` : "no prior local file",
        undo: token ? `modelbound backup restore ${token}` : undefined,
      }, false);
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
