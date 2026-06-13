import { Command } from "commander";
import { z } from "zod";
import { createClient } from "../core/client.js";
import { printSummary } from "../ui/summary.js";

const ListResp = z.object({ versions: z.array(z.object({
  version: z.union([z.string(), z.number()]),
  id: z.string().optional(),
  created_at: z.string().optional(),
  note: z.string().optional(),
})) });
const Generic = z.record(z.any());

export function registerVersion(p: Command) {
  const v = p.command("version").description("File version management");

  v.command("list <skillId>").description("List versions for a skill").action(async (skillId) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const r = await client.call("file-versions", { skill_id: skillId, action: "list" }, ListResp);
    for (const it of r.versions) process.stdout.write(`v${it.version}${it.created_at ? "  " + it.created_at : ""}${it.note ? "  " + it.note : ""}\n`);
  });

  v.command("diff <skillId> <a> <b>").description("Diff two versions").action(async (skillId, a, b) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const r = await client.call("file-versions", { skill_id: skillId, action: "diff", a, b }, Generic);
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  });

  v.command("restore <skillId> <version>").description("Restore a prior version (creates a new backup of current first)").action(async (skillId, version) => {
    const client = createClient({ profile: p.opts().profile ?? "default" });
    const r = await client.call("file-versions", { skill_id: skillId, action: "restore", version }, Generic);
    printSummary({ ok: true, title: `Restored v${version} of ${skillId}`, meta: r.new_version ? `new version ${r.new_version}` : undefined }, !!p.opts().json);
  });
}
