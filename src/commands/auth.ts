// `mb login` — OAuth-style device-code flow.
//
// Flow:
//   1. POST /api/cli/device/start            → { device_code, user_code, verification_uri, interval, expires_in }
//   2. Show user_code + verification_uri to the user.
//   3. Poll  POST /api/cli/device/poll       → { status: "pending" | "approved" | "denied" | "expired", token? }
//   4. On approved, persist token to ~/.modelbound/config.json.
//
// The CLI never reads or writes a password and never opens a browser
// silently; the user pastes the short code into the page themselves.
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { api, ApiError } from "../lib/api.js";
import { clearConfig, loadConfig, saveConfig } from "../lib/config.js";
import { die, globalOpts, printJson, printSuccess } from "../lib/render.js";

interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}
interface DevicePoll {
  status: "pending" | "approved" | "denied" | "expired" | "slow_down";
  token?: string;
  user?: { id: string; email?: string; team_id?: string };
}

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("Authenticate via device-code flow.")
    .action(async (_opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const start = await api<DeviceStart>("/api/cli/device/start", {
        method: "POST",
        anonymous: true,
        apiUrl: g.apiUrl,
        body: { client: "modelbound-cli", version: "0.1.0" },
      });

      // eslint-disable-next-line no-console
      console.log(
        `\n  Open ${chalk.cyan(start.verification_uri)}\n` +
          `  Enter code: ${chalk.bold.yellow(start.user_code)}\n`,
      );

      const spinner = ora("Waiting for approval…").start();
      const intervalMs = Math.max(1, start.interval) * 1000;
      const deadline = Date.now() + start.expires_in * 1000;
      let delay = intervalMs;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, delay));
        try {
          const poll = await api<DevicePoll>("/api/cli/device/poll", {
            method: "POST",
            anonymous: true,
            apiUrl: g.apiUrl,
            body: { device_code: start.device_code },
          });
          if (poll.status === "approved" && poll.token) {
            spinner.succeed("Authenticated.");
            saveConfig({
              ...loadConfig(),
              api_url: g.apiUrl,
              token: poll.token,
              user: poll.user,
            });
            printSuccess(
              poll.user?.email
                ? `Logged in as ${poll.user.email}`
                : "Logged in.",
            );
            return;
          }
          if (poll.status === "denied") {
            spinner.fail("Login denied.");
            process.exit(1);
          }
          if (poll.status === "expired") {
            spinner.fail("Login code expired. Run `mb login` again.");
            process.exit(1);
          }
          if (poll.status === "slow_down") delay += 1000;
        } catch (e) {
          if (e instanceof ApiError && e.status === 428) {
            // pending — keep polling
            continue;
          }
          spinner.fail(e instanceof Error ? e.message : String(e));
          process.exit(1);
        }
      }
      spinner.fail("Login timed out.");
      process.exit(1);
    });

  program
    .command("logout")
    .description("Forget the locally stored API token.")
    .action(() => {
      clearConfig();
      printSuccess("Logged out.");
    });

  program
    .command("whoami")
    .description("Show the currently authenticated user.")
    .action(async (_opts, cmd: Command) => {
      const g = globalOpts(cmd);
      try {
        const me = await api<{ id: string; email?: string; team_id?: string }>(
          "/api/cli/whoami",
          { apiUrl: g.apiUrl },
        );
        if (g.json) return printJson(me);
        printSuccess(me.email ?? me.id);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          die("Not authenticated. Run `mb login`.");
        }
        throw e;
      }
    });
}
