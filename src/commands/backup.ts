import { Command } from "commander";
import { listBackups, restoreBackup, pruneBackups } from "../core/backup.js";
import { printSummary } from "../ui/summary.js";

export function registerBackup(p: Command) {
  const b = p.command("backup").description("Local file backups (.modelbound/backups)");

  b.command("list").description("List local backups").action(async () => {
    const all = await listBackups();
    for (const it of all) process.stdout.write(`${it.token}  ${it.createdAt}  ${it.sourceRel}\n`);
    if (!all.length) process.stdout.write("(no backups)\n");
  });

  b.command("restore <token>").description("Restore a backup by token").action(async (token: string) => {
    const rel = await restoreBackup(token);
    printSummary({ ok: true, title: `Restored ${rel}` }, !!p.opts().json);
  });

  b.command("prune").description("Remove backups older than N days")
    .option("--days <n>", "days to keep", "30")
    .action(async (opts) => {
      const n = await pruneBackups(Number(opts.days));
      printSummary({ ok: true, title: `Pruned ${n} backup(s) older than ${opts.days} days` }, !!p.opts().json);
    });
}
