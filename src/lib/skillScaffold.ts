import fs from "node:fs";
import path from "node:path";
import { buildScopeConstraintBlock } from "./scopeSnippet.js";
import { loadTaskBudgets } from "./loadTaskBudgets.js";

export interface ScaffoldOptions {
  name: string;
  description: string;
  cwd?: string;
  includeScope?: boolean;
  version?: string;
}

export function scaffoldSkillMarkdown(opts: ScaffoldOptions): string {
  const budgets = loadTaskBudgets(opts.cwd ?? process.cwd());
  const scope =
    opts.includeScope !== false
      ? `\n\n${buildScopeConstraintBlock(budgets)}\n`
      : "";
  const versionLine = opts.version ? `\nversion: ${opts.version}` : "";
  return `---
name: ${opts.name}
description: ${opts.description}${versionLine}
review:
  state: draft
---

# ${opts.name.replace(/-/g, " ")}

## Overview

Describe what this skill does and when to trigger it.

## Workflow

1. Understand the request.
2. Execute within scope constraints.
3. Verify the result (tests, lint, or review checklist).${scope}
`;
}

export function defaultSkillPath(cwd: string, name: string): string {
  const candidates = [
    path.join(".cursor", "skills", name, "SKILL.md"),
    path.join("skills", name, "SKILL.md"),
    path.join(".claude", "skills", name, "SKILL.md"),
  ];
  for (const rel of candidates) {
    const parent = path.dirname(path.join(cwd, rel));
    if (fs.existsSync(parent)) return rel;
  }
  return path.join("skills", name, "SKILL.md");
}

export function writeScaffoldedSkill(cwd: string, opts: ScaffoldOptions, outPath?: string): string {
  const rel = outPath ?? defaultSkillPath(cwd, opts.name);
  const abs = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs)) throw new Error(`Skill already exists: ${rel}`);
  fs.writeFileSync(abs, scaffoldSkillMarkdown(opts), "utf8");
  return rel;
}
