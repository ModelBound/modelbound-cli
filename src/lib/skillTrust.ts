// Pure, deterministic heuristics for Skill Trust Score (no AI dependency).
// Scanner version "h5". Bump when rules change so we can re-score in bulk.

import { hasTaskScopeConstraint } from "./taskBudgets.js";

export const SCANNER_VERSION = "h5";

export type Severity = "info" | "warn" | "critical";
export type FindingClass =
  | "injection"
  | "exfiltration"
  | "escalation"
  | "clarity"
  | "fit";

export interface Finding {
  class: FindingClass;
  severity: Severity;
  message: string;
  hint?: string;
}

export interface SkillTrustInput {
  name: string;
  description: string;
  body_md: string;
  allowed_tools: string[];
  neighbors?: Array<{ id: string; name: string; description: string }>;
}

export interface TrustResult {
  clarity: number;
  safety: number;
  fit: number;
  total: number;
  findings: Finding[];
  scanner_version: string;
}

const VAGUE_OPENERS = [
  /^use this skill when/i,
  /^this skill (helps|is for|allows|enables)/i,
  /^helps (you|the user|the agent) (to )?/i,
  /^a skill (that|for)/i,
];

const UNBOUNDED_WORDS =
  /\b(thorough(?:ly)?|exhaustive(?:ly)?|comprehensive(?:ly)?|complete(?:ly)?|entire(?:ly)?|full(?:y)?|all(?:\s+\w+){0,2}\s+(?:files|modules|codebase|project))\b/i;

const HARD_LIMIT_MARKERS =
  /(?:max|maximum|no more than|limit|up to|≤|<=|hard limit)\s*\d+|##\s*scope constraints|<task-split>/i;

const VERIFY_LANGUAGE =
  /\b(test(?:s|ing)?|verify|verification|check(?:ing)?|validate|validation|review(?:ed)?|assert(?:ion)?s?)\b/i;

const INSTALL_CMD =
  /\b(npm|pip|yarn|pnpm|cargo|gem)\s+(install|add)\b/i;

const ADD_DEPENDENCY_PHRASE =
  /\badd (a |an )?(library|dependency|dependencies|package|packages)\b/i;

const APPROVAL_GATE =
  /\b(ask|approve|approval|confirm|permission|explicit(?:ly)?|before install(?:ing)?|must approve)\b/i;

const REFACTOR_UNBOUNDED =
  /\b(refactor(?:ing)?|restructure(?:ing)?|clean up|cleanup|optimiz(?:e|ing))\b/i;

const INJECTION_PATTERNS: Array<{ re: RegExp; msg: string; sev: Severity }> = [
  { re: /ignore (all |any )?(previous|prior|above) (instructions|rules|prompts)/i, sev: "critical", msg: "Contains an 'ignore previous instructions' phrase — classic prompt-injection pattern." },
  { re: /(act|behave|pretend|roleplay) as (?:a |an )?(system|admin|root|developer mode)/i, sev: "critical", msg: "Tells the agent to role-swap into system/admin — privilege-bypass pattern." },
  { re: /<\s*system\s*>/i, sev: "warn", msg: "Embedded <system> tag — agents may interpret this as an override." },
  { re: /[A-Za-z0-9+/]{120,}={0,2}/, sev: "warn", msg: "Long base64-like blob — can hide instructions or payloads." },
  { re: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/, sev: "critical", msg: "Hidden Unicode characters detected (zero-width or text-direction overrides)." },
];

const EXFIL_BODY_PATTERNS: Array<{ re: RegExp; msg: string; sev: Severity }> = [
  { re: /!\[[^\]]*\]\(https?:\/\/[^)]*\{[^}]+\}/i, sev: "critical", msg: "Markdown image with interpolated URL — known data-exfiltration vector." },
  { re: /\b(curl|wget|fetch|POST)\b[^\n]{0,80}\$\{?\w+\}?/i, sev: "warn", msg: "Network call that interpolates a variable into the URL or body." },
  { re: /\b(send|post|upload|exfiltrate)\b[^\n]{0,40}\b(to|via)\b\s+https?:\/\//i, sev: "warn", msg: "Instructs the agent to send data to an external URL." },
];

const ESCALATION_BODY_PATTERNS: Array<{ re: RegExp; msg: string; sev: Severity }> = [
  { re: /\bsudo\b/i, sev: "critical", msg: "Uses `sudo` — requests root privilege." },
  { re: /chmod\s+\+x/i, sev: "warn", msg: "Makes a file executable — combine with downloads = remote code execution risk." },
  { re: /(~\/\.ssh|\/etc\/(passwd|shadow|sudoers)|\.env\b)/i, sev: "critical", msg: "References sensitive paths (SSH keys, /etc, .env)." },
  { re: /\b(npm|pip|brew|apt|yarn|pnpm)\s+(install|add)\b/i, sev: "warn", msg: "Installs packages — supply-chain risk if unscoped." },
];

const SECRET_KEY_NAME_RE =
  /\b([A-Za-z][A-Za-z0-9_-]{1,60}(?:KEY|SECRET|TOKEN|SIGNATURE|PASSWORD|PASSWD|BEARER|APIKEY))\b/i;
const VARIABLE_VALUE_RE =
  /^(\$|\$\{|process\.env|Deno\.env|os\.environ|import\.meta|getenv|ENV\[|<|\{\{|%[A-Z]|`\$|secrets?\.|config\.|settings\.)/i;
const PLACEHOLDER_VALUE_RE =
  /\b(your[_-]?|xxx+|example|placeholder|replace|<insert|insert[_-]?here|here|todo|changeme|base64[_-]?encoded|current[_ ]time|description|sk-xxx)\b/i;
const LITERAL_VALUE_RE = /^[A-Za-z0-9._\-/+=]{12,}$/;

const DANGEROUS_TOOLS = new Set(["Bash", "Shell", "Exec", "Run"]);
const NETWORK_TOOLS = new Set(["WebFetch", "Fetch", "HTTP", "Browser"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "FileWrite"]);

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  return inter / (a.size + b.size - inter);
}

function detectHardcodedSecrets(body: string): Finding[] {
  const findings: Finding[] = [];
  if (!body) return findings;
  const seen = new Set<string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(SECRET_KEY_NAME_RE);
    if (!m || m.index === undefined) continue;
    const keyName = m[1];
    let val: string | null = null;
    const after = line.slice(m.index + m[0].length);
    const colonEq = after.match(/^["'`]?\s*[:=]\s*["'`]?([^"'`\n,;]+?)["'`]?\s*(?:[,;]|$)/);
    if (colonEq) val = colonEq[1].trim();
    else if (line.includes("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      const idx = cells.findIndex((c) => SECRET_KEY_NAME_RE.test(c) && c.length < 80);
      if (idx >= 0 && idx + 2 < cells.length) val = cells[idx + 2];
      else if (idx >= 0 && idx + 1 < cells.length) val = cells[idx + 1];
    }
    if (!val) continue;
    val = val.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!val || VARIABLE_VALUE_RE.test(val) || PLACEHOLDER_VALUE_RE.test(val)) continue;
    if (/^\d+$/.test(val) || val.length < 12 || !LITERAL_VALUE_RE.test(val)) continue;
    const dedup = keyName.toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    findings.push({
      class: "exfiltration",
      severity: "critical",
      message: `Hardcoded credential detected for "${keyName}" — literal secret values must not be embedded in the skill body.`,
      hint: "Reference the secret with ${ENV_VAR}, process.env.X, or your platform's secret manager — never inline the literal value.",
    });
  }
  return findings;
}

function scoreSlopClarity(body: string, findings: Finding[], score: number): number {
  let s = score;

  if (!hasTaskScopeConstraint(body)) {
    findings.push({
      class: "clarity",
      severity: "warn",
      message: "No task-scope limit — skill does not cap files, lines changed, or features per task.",
      hint: "Add a ## Scope Constraints block with max files/LOC/features and a <task-split> stop condition.",
    });
    s -= 10;
  }

  if (UNBOUNDED_WORDS.test(body) && !HARD_LIMIT_MARKERS.test(body)) {
    findings.push({
      class: "clarity",
      severity: "warn",
      message: "Unbounded wording (e.g. thorough, exhaustive, comprehensive) without hard limits.",
      hint: "Pair ambitious language with numeric scope caps or a <task-split> plan when limits would be exceeded.",
    });
    s -= 10;
  }

  if (!VERIFY_LANGUAGE.test(body)) {
    findings.push({
      class: "clarity",
      severity: "info",
      message: "No verification step — skill does not mention tests, checks, or review.",
      hint: "Add an explicit verify/review step so the agent knows when the task is done.",
    });
  }

  if ((INSTALL_CMD.test(body) || ADD_DEPENDENCY_PHRASE.test(body)) && !APPROVAL_GATE.test(body)) {
    findings.push({
      class: "clarity",
      severity: "warn",
      message: "Unapproved dependencies — install/add commands without an ask/approve gate.",
      hint: "Require explicit user approval before npm/pip/cargo installs or adding libraries.",
    });
    s -= 10;
  }

  if (REFACTOR_UNBOUNDED.test(body) && !hasTaskScopeConstraint(body)) {
    findings.push({
      class: "clarity",
      severity: "warn",
      message: "Unbounded refactoring — refactor/restructure/cleanup without scope constraints.",
      hint: "Bound refactors with max files/LOC and a <task-split> plan for larger changes.",
    });
    s -= 10;
  }

  return s;
}

function scoreClarity(input: SkillTrustInput): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 100;
  const body = input.body_md || "";

  const desc = input.description.trim();
  if (!desc) {
    findings.push({
      class: "clarity",
      severity: "critical",
      message: "The `description:` field in your frontmatter has no value.",
      hint: "Fill in `description:` with a one-line trigger ('Triggered when …; does …').",
    });
    return { score: 0, findings };
  }
  if (desc.length < 30) {
    findings.push({ class: "clarity", severity: "warn", message: "Frontmatter description is very short — add a trigger phrase." });
    score -= 20;
  }
  if (VAGUE_OPENERS.some((re) => re.test(desc))) {
    findings.push({
      class: "clarity",
      severity: "warn",
      message: "Frontmatter description opens with a vague phrase.",
      hint: "Rewrite as: 'Triggered when <user intent>; does <outcome>.'",
    });
    score -= 15;
  }
  if (desc.length > 1024) {
    findings.push({ class: "clarity", severity: "warn", message: "Frontmatter description exceeds 1024 chars." });
    score -= 10;
  }

  score = scoreSlopClarity(body, findings, score);

  if (input.neighbors?.length) {
    const meTokens = tokens(`${input.name} ${desc}`);
    let topScore = 0;
    let topName = "";
    for (const n of input.neighbors) {
      const j = jaccard(meTokens, tokens(`${n.name} ${n.description}`));
      if (j > topScore) {
        topScore = j;
        topName = n.name;
      }
    }
    if (topScore > 0.55) {
      findings.push({
        class: "clarity",
        severity: topScore > 0.75 ? "critical" : "warn",
        message: `Reads very similar to "${topName}".`,
        hint: "Make descriptions trigger-specific vs outcome-specific.",
      });
      score -= Math.round(topScore * 40);
    }
  }

  return { score: clamp(score), findings };
}

function scoreSafety(input: SkillTrustInput): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  let score = 100;
  const body = input.body_md || "";

  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(body) || p.re.test(input.description)) {
      findings.push({ class: "injection", severity: p.sev, message: p.msg });
      score -= p.sev === "critical" ? 35 : 15;
    }
  }
  for (const p of EXFIL_BODY_PATTERNS) {
    if (p.re.test(body)) {
      findings.push({ class: "exfiltration", severity: p.sev, message: p.msg });
      score -= p.sev === "critical" ? 30 : 12;
    }
  }
  for (const p of ESCALATION_BODY_PATTERNS) {
    if (p.re.test(body)) {
      findings.push({ class: "escalation", severity: p.sev, message: p.msg });
      score -= p.sev === "critical" ? 30 : 12;
    }
  }

  const tools = new Set(input.allowed_tools);
  const hasBash = [...tools].some((t) => DANGEROUS_TOOLS.has(t));
  const hasNet = [...tools].some((t) => NETWORK_TOOLS.has(t));
  const hasWrite = [...tools].some((t) => WRITE_TOOLS.has(t));

  if (hasBash && hasNet) {
    findings.push({
      class: "exfiltration",
      severity: "critical",
      message: "Skill allows both shell execution and network fetch.",
      hint: "Restrict allowed_tools or add Task Scope constraints.",
    });
    score -= 25;
  }
  if (hasBash && !/scope|constraint|allow(ed|list)/i.test(body)) {
    findings.push({
      class: "escalation",
      severity: "warn",
      message: "Bash is allowed but the skill body doesn't mention any scope constraints.",
      hint: "Add an explicit 'Allowed commands' or 'Forbidden paths' section.",
    });
    score -= 10;
  }
  if (hasWrite && /(~\/\.ssh|\.env|\/etc\/)/i.test(body)) {
    findings.push({ class: "escalation", severity: "critical", message: "Skill can write to sensitive paths." });
    score -= 20;
  }

  for (const f of detectHardcodedSecrets(body)) {
    findings.push(f);
    score -= 30;
  }

  return { score: clamp(score), findings };
}

function scoreFit(input: SkillTrustInput): { score: number; findings: Finding[] } {
  const findings: Finding[] = [];
  const body = (input.body_md || "").trim();
  const desc = (input.description || "").trim();
  if (!body) {
    findings.push({ class: "fit", severity: "warn", message: "Skill body is empty." });
    return { score: 50, findings };
  }
  if (desc.length < 30) return { score: 70, findings };
  const j = jaccard(tokens(desc), tokens(body.slice(0, 4000)));
  const score = clamp(40 + j * 150);
  if (score < 55) {
    findings.push({
      class: "fit",
      severity: "info",
      message: "Frontmatter description and body share few keywords.",
    });
  }
  return { score, findings };
}

export function scoreSkillTrust(input: SkillTrustInput): TrustResult {
  const c = scoreClarity(input);
  const s = scoreSafety(input);
  const f = scoreFit(input);
  const weighted = Math.round(c.score * 0.35 + s.score * 0.45 + f.score * 0.2);
  const hasCriticalSafety = s.findings.some((x) => x.severity === "critical");
  const total = hasCriticalSafety ? Math.min(weighted, 55) : weighted;
  return {
    clarity: c.score,
    safety: s.score,
    fit: f.score,
    total: clamp(total),
    findings: [...c.findings, ...s.findings, ...f.findings],
    scanner_version: SCANNER_VERSION,
  };
}

export function trustTier(total: number): "green" | "amber" | "red" {
  if (total >= 80) return "green";
  if (total >= 60) return "amber";
  return "red";
}
