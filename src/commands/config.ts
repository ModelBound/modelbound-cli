import { Command } from "commander";
import { loadProfile, saveProfile, listProfiles } from "../core/config.js";

export function registerConfig(p: Command) {
  const c = p.command("config").description("Profile configuration");

  c.command("get [key]").description("Show a config value (or all)").action((key) => {
    const prof = loadProfile(p.opts().profile ?? "default");
    if (!key) process.stdout.write(JSON.stringify(prof, null, 2) + "\n");
    else process.stdout.write(String((prof as any)[key] ?? "") + "\n");
  });

  c.command("set <key> <value>").description("Set a config value").action((key, value) => {
    const v: any = value === "true" ? true : value === "false" ? false : value;
    saveProfile(p.opts().profile ?? "default", { [key]: v } as any);
    process.stdout.write(`✓ ${key} = ${v}\n`);
  });

  c.command("profiles").description("List known profiles").action(() => {
    for (const n of listProfiles()) process.stdout.write(`${n}\n`);
  });
}
