// Local backup engine. Mirrors @modelbound/core's BackupEngine surface so
// the CLI and MCP server share semantics. Backups are written 0600 and the
// directory is auto-.gitignore'd.
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const ROOT = ".modelbound/backups";

export interface BackupHandle {
  token: string;        // short id surfaced in summary lines
  absPath: string;
  relPath: string;
  sourceRel: string;
  sha: string;
  createdAt: string;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const gi = path.join(ROOT, ".gitignore");
  try { await fs.access(gi); } catch { await fs.writeFile(gi, "*\n!.gitignore\n", { mode: 0o600 }); }
}

export async function backupFile(absSource: string, cwd = process.cwd()): Promise<BackupHandle> {
  const buf = await fs.readFile(absSource);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const rel = path.relative(cwd, absSource);
  const dir = path.join(cwd, ROOT, rel);
  await ensureDir(dir);
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `${iso}-${sha.slice(0, 7)}.bak`;
  const dest = path.join(dir, fname);
  await fs.writeFile(dest, buf, { mode: 0o600 });
  const token = sha.slice(0, 7);
  await fs.writeFile(dest + ".json", JSON.stringify({ token, sourceRel: rel, sha, createdAt: iso }, null, 2), { mode: 0o600 });
  return { token, absPath: dest, relPath: path.relative(cwd, dest), sourceRel: rel, sha, createdAt: iso };
}

export async function listBackups(cwd = process.cwd()): Promise<BackupHandle[]> {
  const root = path.join(cwd, ROOT);
  try { await fs.access(root); } catch { return []; }
  const out: BackupHandle[] = [];
  async function walk(d: string) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const meta = JSON.parse(await fs.readFile(p, "utf8"));
          out.push({ ...meta, absPath: p.replace(/\.json$/, ""), relPath: path.relative(cwd, p.replace(/\.json$/, "")) });
        } catch { /* ignore */ }
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreBackup(token: string, cwd = process.cwd()): Promise<string> {
  const all = await listBackups(cwd);
  const hit = all.find((b) => b.token === token || b.sha.startsWith(token));
  if (!hit) throw new Error(`No backup matching ${token}`);
  const dest = path.join(cwd, hit.sourceRel);
  // Backup the current state before restoring, so restore itself is reversible.
  try { await backupFile(dest, cwd); } catch { /* may not exist */ }
  await fs.copyFile(hit.absPath, dest);
  return hit.sourceRel;
}

export async function pruneBackups(olderThanDays: number, cwd = process.cwd()): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const all = await listBackups(cwd);
  let n = 0;
  for (const b of all) {
    if (new Date(b.createdAt.replace(/-/g, ":").replace(/T(\d+):(\d+):(\d+)/, "T$1:$2:$3")).getTime() < cutoff) {
      try { await fs.unlink(b.absPath); await fs.unlink(b.absPath + ".json"); n++; } catch { /* */ }
    }
  }
  return n;
}
