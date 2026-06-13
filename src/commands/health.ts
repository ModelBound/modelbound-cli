// `mb health` — connectivity + auth + rate-limit check.
// Useful as the first thing to run in CI to catch token / network issues
// before any pipeline step actually consumes credits.
import { Command } from "commander";
import { api, ApiError } from "../lib/api.js";
import { globalOpts, printJson, printSuccess, printWarn } from "../lib/render.js";
import { resolveApiUrl, resolveToken } from "../lib/config.js";

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Check API connectivity, auth, and rate limits.")
    .action(async (_opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const out: Record<string, unknown> = {
        api_url: resolveApiUrl(g.apiUrl),
        token_present: Boolean(resolveToken()),
      };
      try {
        const res = await api<{ ok: boolean; rate_limit?: { limit: number; remaining: number; reset: number } }>(
          "/api/cli/health",
          { apiUrl: g.apiUrl },
        );
        out.api = res;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          if (g.json) {
            out.api = { ok: false, error: "unauthenticated" };
            return printJson(out);
          }
          printWarn("Not authenticated. Run `mb login`.");
          return;
        }
        throw e;
      }
      if (g.json) return printJson(out);
      printSuccess(`API reachable at ${out.api_url}`);
    });
}
