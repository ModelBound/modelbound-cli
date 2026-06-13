import { Command } from "commander";
import pc from "picocolors";
import { z } from "zod";
import open from "open";
import { createClient } from "../core/client.js";
import { saveProfile, loadProfile } from "../core/config.js";

export function registerAuth(p: Command) {
  const auth = p.command("auth").description("Authentication");

  auth.command("login")
    .description("Sign in via device-code flow")
    .option("--api-key <key>", "skip device flow and store an mb_live_ key directly")
    .action(async (opts) => {
      const profileName = p.opts().profile ?? "default";
      if (opts.apiKey) {
        if (!String(opts.apiKey).startsWith("mb_live_")) throw new Error("API key must start with mb_live_");
        saveProfile(profileName, { apiKey: opts.apiKey });
        process.stdout.write(pc.green("✓ ") + `Saved key to profile "${profileName}"\n`);
        return;
      }
      const client = createClient({ profile: profileName, apiKey: "anon" });
      const start = await client.call(
        "extension-device-auth",
        { action: "start" },
        z.object({ device_code: z.string(), user_code: z.string(), verification_uri: z.string(), interval: z.number().optional() }),
      );
      process.stdout.write(`\nOpen: ${pc.cyan(start.verification_uri)}\nCode: ${pc.bold(start.user_code)}\n\n`);
      try { await open(start.verification_uri); } catch { /* headless */ }
      const interval = (start.interval ?? 5) * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, interval));
        const poll = await client.call(
          "extension-device-auth",
          { action: "poll", device_code: start.device_code },
          z.object({ status: z.string(), api_key: z.string().optional() }),
        );
        if (poll.status === "authorized" && poll.api_key) {
          saveProfile(profileName, { apiKey: poll.api_key });
          process.stdout.write(pc.green("✓ ") + `Signed in to profile "${profileName}"\n`);
          return;
        }
        if (poll.status === "denied" || poll.status === "expired") throw new Error(`Device flow ${poll.status}`);
      }
    });

  auth.command("status").description("Show current profile auth status").action(async () => {
    const name = p.opts().profile ?? "default";
    const prof = loadProfile(name);
    if (!prof.apiKey) { process.stdout.write(pc.yellow("• ") + `Profile "${name}" is not signed in\n`); return; }
    const client = createClient({ profile: name });
    try {
      const r = await client.call("extension-auth-check", {}, z.object({
        valid: z.boolean(), user_email: z.string().nullable().optional(), team_name: z.string().nullable().optional(), plan: z.string().optional(),
      }));
      if (!r.valid) { process.stdout.write(pc.red("✖ ") + "Invalid or expired key\n"); return; }
      process.stdout.write(pc.green("✓ ") + `${r.user_email ?? "unknown"} · team ${r.team_name ?? "—"} · plan ${r.plan ?? "—"}\n`);
    } catch (e: any) {
      process.stdout.write(pc.red("✖ ") + (e?.message ?? String(e)) + "\n");
    }
  });

  auth.command("logout").description("Clear stored key for profile").action(() => {
    const name = p.opts().profile ?? "default";
    saveProfile(name, { apiKey: undefined });
    process.stdout.write(pc.green("✓ ") + `Logged out of profile "${name}"\n`);
  });
}
