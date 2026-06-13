import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export function registerRepo(p: Command) {
  p.command("detect").description("Detect IDE layouts in the current repo").action(async () => {
    const cwd = process.cwd();
    const checks: [string, string][] = [
      [".cursor", "Cursor"],
      [".claude/skills", "Claude Code"],
      [".github/copilot", "Copilot"],
      [".amazonq/rules", "Amazon Q"],
      [".windsurfrules", "Windsurf"],
    ];
    for (const [dir, name] of checks) {
      try { await fs.access(path.join(cwd, dir)); process.stdout.write(`✓ ${name}  (${dir})\n`); }
      catch { /* */ }
    }
  });

  p.command("ls").description("List local skills/rules")
    .option("--type <kind>", "skill | rule", "skill")
    .action(async (opts) => {
      const cwd = process.cwd();
      const root = opts.type === "rule" ? ".cursor" : ".claude/skills";
      try {
        const entries = await fs.readdir(path.join(cwd, root), { withFileTypes: true });
        for (const e of entries) process.stdout.write(`${e.isDirectory() ? "📁" : "📄"} ${path.join(root, e.name)}\n`);
      } catch { process.stdout.write(`(no ${root}/ found)\n`); }
    });

  p.command("lint <path>").description("Lint a skill/rule file").action(async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf8");
    const issues: string[] = [];
    if (!content.startsWith("---")) issues.push("missing frontmatter");
    if (content.length > 64_000) issues.push("file > 64KB — consider splitting");
    if (!issues.length) process.stdout.write("✓ ok\n"); else issues.forEach((i) => process.stdout.write(`• ${i}\n`));
  });

  p.command("validate <path>").description("Validate a skill against the SKILL.md spec").action(async (filePath: string) => {
    const content = await fs.readFile(filePath, "utf8");
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) { process.stdout.write("✖ no frontmatter\n"); process.exit(1); }
    if (!/name\s*:/.test(m![1])) { process.stdout.write("✖ frontmatter missing name\n"); process.exit(1); }
    if (!/description\s*:/.test(m![1])) { process.stdout.write("✖ frontmatter missing description\n"); process.exit(1); }
    process.stdout.write("✓ valid\n");
  });
}
