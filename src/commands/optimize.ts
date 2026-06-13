import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { createClient, uuidv4 } from "../core/client.js";
import { backupFile } from "../core/backup.js";
import { printSummary } from "../ui/summary.js";

const OptimizeResult = z.object({
  tokens_saved: z.number().optional(),
  savings_pct: z.number().optional(),
  optimized_content: z.string().optional(),
  version_id: z.string().optional(),
  files_analyzed: z.number().optional(),
  details: z.array(z.any()).optional(),
});

export function registerOptimize(p: Command) {
  p.command("optimize <target>")
    .description("Optimize a local file or a cloud skill id")
    .option("--dry-run", "preview only — no writes")
    .option("--intensity <level>", "conservative | balanced | aggressive", "balanced")
    .option("--yes", "skip confirmation")
    .option("--no-apply", "do not write the optimized content back to disk")
    .action(async (target: string, opts) => {
      const json = !!p.opts().json;
      const profile = p.opts().profile ?? "default";
      const client = createClient({ profile });
      const isLocal = await isLocalPath(target);

      const body: Record<string, unknown> = {
        mode: opts.dryRun ? "dry_run" : "manual",
        intensity: opts.intensity,
      };
      if (isLocal) {
        body.local_content = await fs.readFile(path.resolve(target), "utf8");
        body.local_path = path.resolve(target);
      } else {
        body.file_id = target;
      }

      const idem = uuidv4();
      const r = await client.call("optimize-tokens", body, OptimizeResult, idem);

      const saved = r.tokens_saved ?? 0;
      const pct = r.savings_pct ?? 0;

      if (!opts.dryRun && opts.apply !== false && isLocal && r.optimized_content && saved > 0) {
        const bh = await backupFile(path.resolve(target));
        await fs.writeFile(path.resolve(target), r.optimized_content);
        printSummary({
          ok: true,
          title: `Optimized ${target} · saved ${saved} tokens (${pct}%)`,
          meta: `backup ${bh.token} · ${r.version_id ? `cloud version ${r.version_id}` : "local-only"}`,
          undo: `modelbound backup restore ${bh.token}`,
        }, json);
        return;
      }

      printSummary({
        ok: saved > 0,
        title: opts.dryRun
          ? `Dry-run: ${saved} tokens (${pct}%) would be saved on ${target}`
          : saved > 0 ? `Optimized ${target} · saved ${saved} tokens (${pct}%)` : `No savings found for ${target}`,
        meta: r.version_id ? `cloud version ${r.version_id}` : undefined,
        undo: r.version_id ? `modelbound version restore ${target} <prev>` : undefined,
      }, json);
    });
}

async function isLocalPath(t: string): Promise<boolean> {
  try { await fs.access(t); return true; } catch { return false; }
}
