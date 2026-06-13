import { Command } from "commander";
import { loadProfile } from "../core/config.js";

export function registerMcp(p: Command) {
  const m = p.command("mcp").description("MCP helpers");

  m.command("print-config")
    .description("Print an mcp.json snippet for the current profile")
    .option("--ide <name>", "cursor | claude | copilot", "cursor")
    .action((opts) => {
      const prof = loadProfile(p.opts().profile ?? "default");
      const cfg = {
        mcpServers: {
          modelbound: {
            command: "npx",
            args: ["-y", "@modelbound/modelbound-mcp-server@latest"],
            env: { MODELBOUND_API_KEY: prof.apiKey ?? "<paste mb_live_ key>" },
          },
        },
      };
      process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
      process.stderr.write(`\n# Save the JSON above to:\n# cursor: ~/.cursor/mcp.json\n# claude: ~/.claude/mcp.json\n`);
    });
}
