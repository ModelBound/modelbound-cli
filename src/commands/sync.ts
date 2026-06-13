import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { createClient } from "../core/client.js";
import { backupFile } from "../core/backup.js";
import { printSummary } from "../ui/summary.js";

const PushResp = z.object({ skill_id: z.string().optional(), version_id: z.string().optional() });
const PullResp = z.object({ content: z.string(), skill_id: z.string().optional(), version_id: z.string().optional() });

export function registerSync(p: Command) {
  p.command("push <path>").description("Push a local skill file to ModelBound").action(async (filePath: string) => {
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

  p.command("sync").description("Interactive diff + reconcile of local vs cloud").action(async () => {
    process.stdout.write("sync: interactive mode coming in 0.2 — use `push` / `pull` for now\n");
  });
}
