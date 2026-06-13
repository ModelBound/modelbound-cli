import pc from "picocolors";

export interface SummaryLine {
  ok: boolean;
  title: string;
  meta?: string;
  undo?: string;
}

export function printSummary(s: SummaryLine, json = false) {
  if (json) {
    process.stdout.write(JSON.stringify({ kind: "summary", ...s }) + "\n");
    return;
  }
  const mark = s.ok ? pc.green("✓") : pc.red("✖");
  process.stdout.write(`${mark} ${s.title}\n`);
  if (s.meta) process.stdout.write(`  ${pc.dim(s.meta)}\n`);
  if (s.undo) process.stdout.write(`  ${pc.dim("undo: ")}${pc.cyan(s.undo)}\n`);
}
