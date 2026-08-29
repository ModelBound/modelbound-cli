import { Command } from "commander";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { writeScaffoldedSkill } from "../lib/skillScaffold.js";
import { buildServedSkillPayload, parseSkillForTrust } from "../lib/skillPayload.js";
import { applyReviewToFile, ciBlocksMerge, hashBody, readSkillParts, type ReviewState } from "../lib/skillReview.js";
import { SCANNER_VERSION } from "../lib/skillTrust.js";
import { summarizeConfidence, readRuns } from "../lib/confidenceHistory.js";

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

async function writeFile(p: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

export function registerRepoLocal(p: Command): void {
  p.command("init")
    .description("Scaffold .modelbound/task-budgets.json with default scope limits")
    .action(async () => {
      const cwd = process.cwd();
      const dir = path.join(cwd, ".modelbound");
      const cfg = path.join(dir, "task-budgets.json");
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.access(cfg);
        process.stdout.write(`✓ ${cfg} already exists\n`);
      } catch {
        await writeFile(
          cfg,
          `${JSON.stringify(
            {
              files: { max: 5 },
              loc: { max: 250 },
              features: { max: 1 },
            },
            null,
            2,
          )}\n`,
        );
        process.stdout.write(`✓ created ${cfg}\n`);
      }
    });

  p.command("new <name>")
    .description("Create a new local SKILL.md with default scope constraints")
    .requiredOption("-d, --description <text>", "skill description / trigger")
    .option("-o, --out <path>", "output path")
    .option("--no-scope", "omit scope-constraint block")
    .action(async (name: string, opts: { description: string; out?: string; scope: boolean }) => {
      const rel = writeScaffoldedSkill(process.cwd(), {
        name,
        description: opts.description,
        includeScope: opts.scope !== false,
      }, opts.out);
      process.stdout.write(`✓ created ${rel}\n`);
    });

  p.command("trust <path>")
    .description("Print trust score + confidence trend for a local skill")
    .action(async (filePath: string) => {
      const cwd = process.cwd();
      const raw = await readFile(path.resolve(cwd, filePath));
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      process.stdout.write(`trust_score: ${payload.trust_score} (${payload.scanner_version})\n`);
      process.stdout.write(`review_state: ${payload.review_state}\n`);
      if (payload.confidence.latest_trust != null) {
        const arrow =
          payload.confidence.trend === "up" ? "↑" : payload.confidence.trend === "down" ? "↓" : "→";
        process.stdout.write(
          `confidence: pass_rate=${payload.confidence.pass_rate ?? "n/a"}% trust=${payload.confidence.latest_trust} ${arrow}\n`,
        );
      }
      for (const f of payload.trust.findings) {
        process.stdout.write(`• [${f.severity}] ${f.message}\n`);
      }
    });

  const review = p.command("review").description("Local skill review lifecycle");

  review
    .command("request <path>")
    .description("Mark skill pending_review")
    .action(async (filePath: string) => {
      const abs = path.resolve(process.cwd(), filePath);
      const raw = await readFile(abs);
      const next = applyReviewToFile(raw, { state: "pending_review" });
      await writeFile(abs, next);
      process.stdout.write(`✓ pending_review ${filePath}\n`);
    });

  review
    .command("approve <path>")
    .description("Approve skill (stores body hash + trust score)")
    .option("--by <name>", "reviewer id")
    .option("--notes <text>", "review notes")
    .action(async (filePath: string, opts: { by?: string; notes?: string }) => {
      const abs = path.resolve(process.cwd(), filePath);
      const raw = await readFile(abs);
      const parts = readSkillParts(raw);
      const trust = parseSkillForTrust(raw, filePath);
      const next = applyReviewToFile(raw, {
        state: "approved",
        reviewed_by: opts.by ?? process.env.USER ?? "local",
        reviewed_at: new Date().toISOString(),
        approved_hash: hashBody(parts.body),
        approved_trust: trust.total,
        scanner_version: SCANNER_VERSION,
        notes: opts.notes,
      });
      await writeFile(abs, next);
      process.stdout.write(`✓ approved ${filePath} (trust ${trust.total})\n`);
    });

  review
    .command("reject <path>")
    .description("Reject skill")
    .option("--by <name>", "reviewer id")
    .option("--notes <text>", "review notes")
    .action(async (filePath: string, opts: { by?: string; notes?: string }) => {
      const abs = path.resolve(process.cwd(), filePath);
      const raw = await readFile(abs);
      const next = applyReviewToFile(raw, {
        state: "rejected",
        reviewed_by: opts.by ?? process.env.USER ?? "local",
        reviewed_at: new Date().toISOString(),
        notes: opts.notes,
      });
      await writeFile(abs, next);
      process.stdout.write(`✓ rejected ${filePath}\n`);
    });

  review
    .command("status <path>")
    .description("Show review_state, review_meta, trust, confidence")
    .action(async (filePath: string) => {
      const cwd = process.cwd();
      const raw = await readFile(path.resolve(cwd, filePath));
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    });

  review
    .command("gate <path>")
    .description("CI gate — exit 1 if skill is not approved")
    .action(async (filePath: string) => {
      const cwd = process.cwd();
      const raw = await readFile(path.resolve(cwd, filePath));
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      if (ciBlocksMerge(payload.review_state as ReviewState)) {
        process.stderr.write(`✖ review gate failed: ${payload.review_state}\n`);
        process.exit(1);
      }
      process.stdout.write(`✓ approved skill ${filePath}\n`);
    });
}
