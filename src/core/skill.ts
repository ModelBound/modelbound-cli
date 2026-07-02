import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getCurrentBranch, getRepoFullName } from "./git.js";
import { callMcpTool, createMcpClient, resolveApiKey, type McpClientOpts } from "./mcp.js";
import { prepareSyncAuth } from "./auth-cache.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SourceIde = "cursor" | "kiro" | "claude" | "vscode" | "copilot" | "windsurf" | "modelbound";

export interface SkillTarget {
  skillId?: string;
  slug: string;
  relativePath: string;
  absolutePath: string;
  label: string;
  sourceIde: SourceIde;
}

const SKILL_PATTERNS: Array<{ test: RegExp; ide: SourceIde }> = [
  { test: /^\.modelbound\/.+\.(md|json)$/i, ide: "modelbound" },
  { test: /^\.kiro\/skills\/.+\.md$/i, ide: "kiro" },
  { test: /^\.cursor\/rules\/.+\.(md|mdc)$/i, ide: "cursor" },
  { test: /^\.claude\/.+\.md$/i, ide: "claude" },
  { test: /^\.agents\/skills\/[^/]+\/SKILL\.md$/i, ide: "copilot" },
];

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isSkillFile(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, "/");
  return SKILL_PATTERNS.some(({ test }) => test.test(norm));
}

export function detectSourceIde(relativePath: string): SourceIde {
  const norm = relativePath.replace(/\\/g, "/");
  for (const { test, ide } of SKILL_PATTERNS) {
    if (test.test(norm)) return ide;
  }
  return "modelbound";
}

export function slugFromPath(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, "/");
  const agents = norm.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/i);
  if (agents) return agents[1];
  const base = path.basename(norm);
  return base.replace(/\.(md|mdc|json)$/i, "");
}

/** Resolve a file path, slug, or UUID into a SkillTarget (no cloud calls). */
export function resolveSkillFromPath(cwd: string, target: string): SkillTarget {
  if (isUuid(target)) {
    return {
      skillId: target,
      slug: target.slice(0, 8),
      relativePath: target,
      absolutePath: target,
      label: target,
      sourceIde: "modelbound",
    };
  }

  const abs = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  const rel = path.relative(cwd, abs).replace(/\\/g, "/");
  const slug = slugFromPath(rel);

  return {
    slug,
    relativePath: rel,
    absolutePath: abs,
    label: rel,
    sourceIde: detectSourceIde(rel),
  };
}

export interface WorkspaceContext {
  workspace_path: string;
  repo_full_name?: string;
  file_hints?: string[];
}

export async function setWorkspaceContext(
  cwd: string,
  opts: McpClientOpts & { repo?: string } = {},
): Promise<unknown> {
  const repo = opts.repo ?? (await getRepoFullName(cwd));
  const args: WorkspaceContext = {
    workspace_path: path.resolve(cwd),
    file_hints: [".modelbound", ".cursor/rules", ".kiro/skills", ".claude"],
  };
  if (repo) args.repo_full_name = repo;
  return callMcpTool("set_workspace_context", { ...args }, opts);
}

export async function ensureSkillSynced(
  cwd: string,
  target: string,
  opts: McpClientOpts & { repo?: string } = {},
): Promise<string> {
  const profile = opts.profile ?? "default";
  const apiKey = resolveApiKey(profile);
  await prepareSyncAuth(profile, apiKey);

  const skill = resolveSkillFromPath(cwd, target);
  if (skill.skillId) return skill.skillId;

  await setWorkspaceContext(cwd, opts);

  try {
    await fs.access(skill.absolutePath);
  } catch {
    // Not a local file — try slug lookup
    const found = await callMcpTool(
      "get_skill",
      { skill_id: skill.slug },
      { ...opts, aliases: ["skills.get"] },
    );
    const id = (found as { skill_id?: string; id?: string })?.skill_id
      ?? (found as { skill_id?: string; id?: string })?.id;
    if (id) return id;
    throw new Error(`Skill not found: ${target}. Provide a local skill file path or sync first.`);
  }

  const body_md = await fs.readFile(skill.absolutePath, "utf8");
  const repo = opts.repo ?? (await getRepoFullName(cwd));
  const branch = await getCurrentBranch(cwd);

  const synced = await callMcpTool("sync_skill_from_ide", {
    repo_url: repo ? `https://github.com/${repo}` : undefined,
    branch,
    source_ide: skill.sourceIde,
    source_path: skill.relativePath,
    body_md,
  }, opts);

  const skillId =
    (synced as { skill_id?: string })?.skill_id ??
    (synced as { id?: string })?.id;
  if (skillId) return skillId;

  const fallback = await callMcpTool(
    "get_skill",
    { skill_id: skill.slug },
    { ...opts, aliases: ["skills.get"] },
  );
  const fallbackId =
    (fallback as { skill_id?: string })?.skill_id ??
    (fallback as { id?: string })?.id;
  if (fallbackId) return fallbackId;

  throw new Error(`Could not resolve skill UUID for ${skill.label}. Run \`modelbound sync --file ${skill.relativePath}\`.`);
}

/** Resolve --skill target to a repo-linked UUID. Local file paths always sync to avoid slug collisions. */
export interface PulledSkill {
  content: string;
  skillId: string;
  slug: string | null;
  sourcePath: string | null;
}

export function isErrorSkillContent(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return (
    /^skill not found\b/.test(normalized) ||
    /^not found\b/.test(normalized) ||
    /^error[:\s]/.test(normalized)
  );
}

export function parseSkillMcpPayload(data: unknown, skillId: string): PulledSkill | null {
  if (!data) return null;

  if (typeof data === "string") {
    if (!data.trim() || isErrorSkillContent(data)) return null;
    return { content: data, skillId, slug: null, sourcePath: null };
  }

  if (typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const nested = obj.skill && typeof obj.skill === "object"
    ? (obj.skill as Record<string, unknown>)
    : null;

  const content =
    (typeof obj.body_md === "string" ? obj.body_md : null) ??
    (nested && typeof nested.body_md === "string" ? nested.body_md : null) ??
    (typeof obj.body === "string" ? obj.body : null) ??
    (typeof obj.text === "string" ? obj.text : null) ??
    "";

  if (!content.trim() || isErrorSkillContent(content)) return null;

  return {
    content,
    skillId: String(obj.skill_id ?? obj.id ?? skillId),
    slug: typeof obj.slug === "string" ? obj.slug : null,
    sourcePath: typeof obj.source_path === "string" ? obj.source_path : null,
  };
}

/** Fetch skill markdown from hosted MCP (replaces legacy sync-cloud-pull edge fn). */
export async function pullSkillFromCloud(
  skillIdOrSlug: string,
  opts: McpClientOpts = {},
): Promise<PulledSkill> {
  const idArg = skillIdOrSlug;
  const args = { skill_id: idArg, file_id: idArg };
  const attempts: Array<() => Promise<unknown>> = [
    () => callMcpTool("get_skill", args, { ...opts, aliases: ["skills.get"] }),
    () => callMcpTool("modelbound.callTool", {
      tool_name: "skills.get",
      arguments: args,
    }, opts),
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const parsed = parseSkillMcpPayload(data, idArg);
      if (parsed) return parsed;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error(`Skill not found or empty (${skillIdOrSlug})`);
}

export async function resolveSkillId(
  cwd: string,
  target: string | undefined,
  opts: McpClientOpts & { repo?: string; sync?: boolean } = {},
): Promise<string> {
  if (!target) throw new Error("--skill is required (file path, slug, or UUID).");
  const skill = resolveSkillFromPath(cwd, target);
  if (skill.skillId) return skill.skillId;

  let hasLocalFile = false;
  try {
    await fs.access(skill.absolutePath);
    hasLocalFile = !isUuid(target);
  } catch { /* slug/remote target */ }

  if (hasLocalFile || opts.sync) return ensureSkillSynced(cwd, target, opts);

  await setWorkspaceContext(cwd, opts);
  const found = await callMcpTool(
    "get_skill",
    { skill_id: skill.slug },
    { ...opts, aliases: ["skills.get"] },
  );
  const id = (found as { skill_id?: string; id?: string })?.skill_id
    ?? (found as { skill_id?: string; id?: string })?.id;
  if (id) return id;

  throw new Error(`Could not resolve skill: ${target}. Run \`modelbound sync --file ${target}\`.`);
}

export { createMcpClient, callMcpTool };
