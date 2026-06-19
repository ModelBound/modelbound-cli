import { loadProfile } from "./config.js";
import { loadConfig } from "../lib/config.js";

const DEFAULT_MCP_URL = "https://mcp.modelbound.co/mcp?source=cli";

let nextId = 1;

export class McpError extends Error {
  constructor(message: string, public detail?: unknown) {
    super(message);
    this.name = "McpError";
  }
}

export interface McpClientOpts {
  profile?: string;
  apiKey?: string;
  mcpUrl?: string;
}

export function resolveApiKey(profile = "default"): string {
  const prof = loadProfile(profile);
  const key = prof.apiKey ?? process.env.MODELBOUND_API_KEY ?? loadConfig().token;
  if (!key) {
    throw new McpError("No API key. Set MODELBOUND_API_KEY or run `modelbound auth login`.");
  }
  if (!key.startsWith("mb_live_")) {
    throw new McpError("API key must start with mb_live_. Run `modelbound auth login`.");
  }
  return key;
}

export function resolveMcpUrl(override?: string): string {
  if (override) return override;
  if (process.env.MODELBOUND_MCP_URL) return process.env.MODELBOUND_MCP_URL;
  const prof = loadProfile("default");
  if (prof.mcpUrl) return prof.mcpUrl;
  const cfg = loadConfig();
  if (cfg.mcp_url) return cfg.mcp_url;
  return DEFAULT_MCP_URL;
}

/** Surface hosted MCP errors that arrive without HTTP failure. */
export function extractMcpError(text: string, structured?: unknown): string | undefined {
  const parts: string[] = [];
  if (typeof text === "string") {
    if (text.includes("[MCP_ERROR]")) parts.push(text.replace(/^\[MCP_ERROR\]\s*/, ""));
    if (text.includes("Pipeline failed:")) parts.push(text.trim());
    if (text.includes("Lookup failed:")) parts.push(text.trim());
  }
  if (structured && typeof structured === "object" && structured !== null && "error" in structured) {
    const err = (structured as { error?: unknown }).error;
    if (typeof err === "string") parts.push(err);
    else if (err) parts.push(JSON.stringify(err));
  }
  return parts.length ? parts.join("\n") : undefined;
}

function parseToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const text = r.content?.map((c) => c.text ?? "").join("\n").trim();
  const structured = r.structuredContent;
  const err = text ? extractMcpError(text, structured) : extractMcpError("", structured);
  if (r.isError || err) throw new McpError(err ?? text ?? "MCP tool failed", structured ?? text);

  if (structured !== undefined) return structured;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

export function createMcpClient(opts: McpClientOpts = {}) {
  const profile = opts.profile ?? "default";
  const apiKey = opts.apiKey ?? resolveApiKey(profile);
  const mcpUrl = resolveMcpUrl(opts.mcpUrl);

  async function call(method: string, params: unknown): Promise<unknown> {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    let raw = await res.text();
    if (contentType.includes("text/event-stream")) {
      const dataLines = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter(Boolean);
      raw = dataLines[dataLines.length - 1] ?? "";
    }
    let body: { result?: unknown; error?: { message?: string; data?: unknown } } = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        if (!res.ok) throw new McpError(`MCP HTTP ${res.status}: ${raw}`);
        throw new McpError(raw);
      }
    }
    if (!res.ok) {
      throw new McpError(body.error?.message ?? `MCP HTTP ${res.status}`, body.error?.data ?? raw);
    }
    if (body.error) {
      throw new McpError(body.error.message ?? "MCP error", body.error.data);
    }
    return body.result;
  }

  async function callTool(name: string, args: Record<string, unknown>, aliases?: string[]): Promise<unknown> {
    const names = [name, ...(aliases ?? [])];
    let lastErr: unknown;
    for (const toolName of names) {
      try {
        const result = await call("tools/call", { name: toolName, arguments: args });
        return parseToolResult(result);
      } catch (e) {
        lastErr = e;
        if (!(e instanceof McpError) || !String(e.message).includes("Unknown tool")) throw e;
      }
    }
    throw lastErr ?? new McpError(`Unknown MCP tool: ${name}`);
  }

  return { call, callTool, apiKey, mcpUrl };
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
  opts: McpClientOpts & { aliases?: string[] } = {},
): Promise<unknown> {
  const client = createMcpClient(opts);
  return client.callTool(name, args, opts.aliases);
}
