import { Command } from "commander";
import { z } from "zod";
import { createClient } from "../core/client.js";

const Generic = z.record(z.any());

export function registerTest(p: Command) {
  p.command("test <skillId>")
    .description("Run a saved test case or ad-hoc prompt against a skill")
    .option("--case <id>", "saved test case id")
    .option("--prompt <text>", "ad-hoc prompt")
    .action(async (skillId, opts) => {
      const client = createClient({ profile: p.opts().profile ?? "default" });
      const r = await client.call("skill-test-run", { skill_id: skillId, case_id: opts.case, prompt: opts.prompt }, Generic);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  p.command("benchmark <skillId>")
    .description("Run the benchmark suite for a skill")
    .action(async (skillId) => {
      const client = createClient({ profile: p.opts().profile ?? "default" });
      const r = await client.call("benchmark-skill", { skill_id: skillId }, Generic);
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });
}
