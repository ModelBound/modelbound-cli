import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { createClient } from "./client.js";

const CACHE_FILE = path.join(os.homedir(), ".modelbound", "auth-cache.json");
const CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  fingerprint: string;
  validatedAt: number;
  valid: boolean;
}

function fingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function loadCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>): void {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

const AuthCheck = z.object({
  valid: z.boolean(),
  user_email: z.string().nullable().optional(),
  team_name: z.string().nullable().optional(),
});

/** Validate API key with 6-day cache (matches extension auth-validate.ts). */
export async function prepareSyncAuth(profile: string, apiKey: string): Promise<void> {
  const fp = fingerprint(apiKey);
  const cache = loadCache();
  const entry = cache[fp];
  if (entry && Date.now() - entry.validatedAt < CACHE_TTL_MS && entry.valid) return;

  try {
    const client = createClient({ profile, apiKey });
    const r = await client.call("extension-auth-check", {}, AuthCheck);
    if (r.valid) {
      cache[fp] = { fingerprint: fp, validatedAt: Date.now(), valid: true };
      saveCache(cache);
      return;
    }
    cache[fp] = { fingerprint: fp, validatedAt: Date.now(), valid: false };
    saveCache(cache);
    throw new Error("Invalid or expired API key. Run `modelbound auth login`.");
  } catch (e) {
    // Transient auth-check failures — proceed; MCP is source of truth (extension parity).
    if (e instanceof Error && e.message.includes("Invalid or expired")) throw e;
  }
}
