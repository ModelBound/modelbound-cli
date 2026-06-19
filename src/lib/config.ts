// Persistent, user-scoped config for the ModelBound CLI.
// Stored at ~/.modelbound/config.json with 0600 perms so other users on a
// shared machine can't read the API token.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DIR = path.join(os.homedir(), ".modelbound");
const FILE = path.join(DIR, "config.json");

export interface CliConfig {
  api_url?: string;
  mcp_url?: string;
  token?: string;
  // Profile cache (populated after `mb login` or first authenticated call)
  user?: { id: string; email?: string; team_id?: string };
}

export function loadConfig(): CliConfig {
  try {
    const raw = fs.readFileSync(FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: CliConfig): void {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Tighten in case the file already existed with looser perms.
  try { fs.chmodSync(FILE, 0o600); } catch { /* best-effort */ }
}

export function clearConfig(): void {
  try { fs.unlinkSync(FILE); } catch { /* no-op */ }
}

export function resolveApiUrl(override?: string): string {
  return (
    override ||
    process.env.MODELBOUND_API_URL ||
    loadConfig().api_url ||
    "https://modelbound.co"
  );
}

export function resolveToken(): string | undefined {
  return process.env.MODELBOUND_API_KEY || loadConfig().token;
}
