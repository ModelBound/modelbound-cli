import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Parse org/repo from git remote origin URL. */
export async function getRepoFullName(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd });
    const url = stdout.trim();
    const ssh = url.match(/git@[^:]+:([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (ssh) return ssh[1];
    const https = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (https) return https[1];
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    return stdout.trim() || "main";
  } catch {
    return "main";
  }
}
