import { Command } from "commander";
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { staticScan, CATEGORY_LABELS, type ScanResult } from "../lib/flightCheck.js";

const SKILL_FILES = /(SKILL\.md|CLAUDE\.md|AGENTS\.md|\.cursorrules|\.mdc|\.md)$/i;

async function collect(target: string): Promise<string[]> {
  const s = await stat(target);
  if (s.isFile()) return [target];
  const out: string[] = [];
  for (const e of await readdir(target, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    const p = path.join(target, e.name);
    if (e.isDirectory()) out.push(...(await collect(p)));
    else if (SKILL_FILES.test(e.name)) out.push(p);
  }
  return out;
}

export function renderScan(file: string, r: ScanResult): void {
  const head = r.blocking
    ? pc.red(`✖ ${file}`) + pc.dim(` — ${r.blocking} blocking, ${r.warnings} warnings`)
    : r.warnings
      ? pc.yellow(`• ${file}`) + pc.dim(` — ${r.warnings} warning${r.warnings > 1 ? "s" : ""}`)
      : pc.green(`✓ ${file}`) + pc.dim(" — all clear");
  process.stdout.write(`${head} ${pc.dim(`(~${r.tokens} tokens)`)}\n`);
  for (const f of r.findings) {
    const tag = f.severity === "blocking" ? pc.red("blocking") : pc.yellow("warning ");
    process.stdout.write(`   ${tag} ${f.id} ${f.title}${f.line ? pc.dim(` (line ${f.line})`) : ""}\n`);
    process.stdout.write(pc.dim(`            ${f.fix}\n`));
  }
  if (!r.findings.length) {
    process.stdout.write(pc.dim(`   passed: ${r.passed.map((c) => CATEGORY_LABELS[c]).join(", ")}\n`));
  }
}

export function registerCheck(program: Command): void {
  program
    .command("check [paths...]")
    .description("Flight Check: offline safety scan for skills and prompts (no account, no AI cost)")
    .option("--strict", "treat warnings as failures")
    .action(async (paths: string[], opts: { strict?: boolean }, cmd: Command) => {
      const json = Boolean(cmd.optsWithGlobals().json);
      const targets = paths.length ? paths : ["."];
      const files = (await Promise.all(targets.map((t) => collect(path.resolve(process.cwd(), t))))).flat();
      if (!files.length) {
        process.stderr.write("No skill or prompt files found.\n");
        process.exitCode = 1;
        return;
      }
      const results = await Promise.all(files.map(async (f) => ({ file: path.relative(process.cwd(), f) || f, ...staticScan(await readFile(f, "utf8")) })));
      const blocking = results.reduce((a, r) => a + r.blocking, 0);
      const warnings = results.reduce((a, r) => a + r.warnings, 0);
      if (json) {
        process.stdout.write(JSON.stringify({ files: results, blocking, warnings, ok: blocking === 0 && (!opts.strict || warnings === 0) }) + "\n");
      } else {
        for (const r of results) renderScan(r.file, r);
        process.stdout.write(`\n${files.length} file${files.length > 1 ? "s" : ""} · ${blocking} blocking · ${warnings} warnings\n`);
        process.stdout.write(pc.dim("Measure how much a skill helps (Skill Lift): https://modelbound.co/flight-check\n"));
      }
      if (blocking > 0 || (opts.strict && warnings > 0)) process.exitCode = 1;
    });
}
