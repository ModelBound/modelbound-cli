import { Command } from "commander";
import pc from "picocolors";
import { runAuthStatus } from "./auth.js";
import { resolveApiKey, resolveMcpUrl, createMcpClient } from "../core/mcp.js";
import { globalOpts, printJson, printSuccess } from "../lib/render.js";

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Check MCP connectivity and auth status")
    .action(async (_opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const profile = program.opts().profile ?? "default";
      const out: Record<string, unknown> = { mcp_url: resolveMcpUrl(g.mcpUrl) };

      try {
        resolveApiKey(profile);
        out.api_key_present = true;
      } catch {
        out.api_key_present = false;
        if (g.json) return printJson({ ...out, ok: false, error: "missing_api_key" });
        process.stdout.write(pc.yellow("• ") + "No API key. Run `modelbound auth login`.\n");
        return;
      }

      try {
        const client = createMcpClient({ profile, mcpUrl: g.mcpUrl });
        await client.callTool("set_workspace_context", {
          workspace_path: process.cwd(),
          file_hints: [".modelbound", ".cursor/rules", ".kiro/skills", ".claude"],
        });
        out.mcp_reachable = true;
      } catch (e) {
        out.mcp_reachable = false;
        out.mcp_error = (e as Error).message;
        if (g.json) return printJson({ ...out, ok: false });
        process.stdout.write(pc.red("✖ ") + `MCP unreachable: ${(e as Error).message}\n`);
        return;
      }

      if (g.json) {
        return printJson({ ...out, ok: true });
      }
      printSuccess(`MCP reachable at ${out.mcp_url}`);
      await runAuthStatus(profile);
    });
}
