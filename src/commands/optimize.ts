import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { api } from "../lib/api.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";
import { backupFile } from "../core/backup.js";

export function registerOptimize(p: Command) {
  p.command("optimize <target>")
    .description("Optimize a local file or a cloud skill id")
    .option("--dry-run", "preview only — no writes")
    .option("--intensity <level>", "conservative | balanced | aggressive", "balanced")
    .option("--yes", "skip confirmation")
    .option("--no-apply", "do not write the optimized content back to disk")
    .action(async (target: string, opts, cmd) => {
      const g = globalOpts(cmd);
      const isLocal = await isLocalPath(target);

      const body: Record<string, unknown> = {
        mode: opts.dryRun ? "dry_run" : "manual",
        intensity: opts.intensity,
      };
      if (isLocal) {
        body.local_content = await fs.readFile(path.resolve(target), "utf8");
        body.local_path = path.resolve(target);
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
        body.skill_id = target;
      } else {
        body.slug = target;
      }

      const r = await api<{
        tokens_saved?: number;
        savings_pct?: number;
        optimized_content?: string;
        version_id?: string;
      }>("/api/cli/optimize", { method: "POST", apiUrl: g.apiUrl, body });

      const saved = r.tokens_saved ?? 0;
      const pct = r.savings_pct ?? 0;

      if (g.json) return printJson(r);

      if (!opts.dryRun && opts.apply !== false && isLocal && r.optimized_content && saved > 0) {
        const bh = await backupFile(path.resolve(target));
        await fs.writeFile(path.resolve(target), r.optimized_content);
        printSuccess(`Optimized ${target} · saved ${saved} tokens (${pct}%) · backup ${bh.token}`);
        return;
      }

      if (opts.dryRun) {
        printSuccess(`Dry-run: ${saved} tokens (${pct}%) would be saved on ${target}`);
      } else if (saved > 0) {
        printSuccess(`Optimized ${target} · saved ${saved} tokens (${pct}%)`);
      } else {
        printSuccess(`No savings found for ${target}`);
      }
    });
}

async function isLocalPath(t: string): Promise<boolean> {
  try { await fs.access(t); return true; } catch { return false; }
}
