/**
 * Flight Check static scan — offline, zero AI cost.
 * Mirrors ModelBound web app src/lib/flightCheck/staticScan.ts. Keep rule ids stable.
 */

export type Severity = "blocking" | "warning";
export type Category =
  | "injection" | "exfiltration" | "secrets" | "excessive_agency"
  | "dangerous_code" | "loop_hazard" | "hygiene" | "budget";

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  fix: string;
  line?: number;
  excerpt?: string;
}

interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  fix: string;
  re: RegExp;
}

const RULES: Rule[] = [
  // Prompt injection / instruction hijacking
  { id: "INJ001", category: "injection", severity: "blocking", title: "Tries to override earlier instructions",
    fix: "Remove phrases that tell the agent to ignore or forget prior instructions.",
    re: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?)\b/i },
  { id: "INJ002", category: "injection", severity: "blocking", title: "Hides instructions from the user",
    fix: "Agents should never be told to conceal behaviour from the person using them.",
    re: /\b(do not|don't|never)\s+(tell|inform|reveal to|mention to)\s+the\s+user\b/i },
  { id: "INJ003", category: "injection", severity: "warning", title: "Invisible or zero-width characters",
    fix: "Delete hidden Unicode characters; they can smuggle instructions past reviewers.",
    re: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/ },
  { id: "INJ004", category: "injection", severity: "warning", title: "Reveals or rewrites the system prompt",
    fix: "Don't ask the agent to print, leak or replace its system prompt.",
    re: /\b(print|reveal|output|leak|replace)\b[^.\n]{0,30}\bsystem prompt\b/i },

  // Exfiltration
  { id: "EXF001", category: "exfiltration", severity: "blocking", title: "Sends data to an external URL",
    fix: "Remove upload/post steps to third-party endpoints, or route them through an approved tool.",
    re: /\b(curl|wget|fetch|post|upload|send)\b[^\n]{0,60}https?:\/\/(?!localhost|127\.0\.0\.1)[^\s)]+/i },
  { id: "EXF002", category: "exfiltration", severity: "blocking", title: "Reads credential or key files",
    fix: "Skills should never read ~/.ssh, ~/.aws, .env or similar secret stores.",
    re: /(~\/\.(ssh|aws|gnupg|config\/gcloud|claude)|\bid_rsa\b|\.env\b(?!\.example)|credentials\.json)/i },

  // Secrets
  { id: "SEC001", category: "secrets", severity: "blocking", title: "Hard-coded API key or token",
    fix: "Delete the key from the skill and rotate it; reference an environment variable instead.",
    re: /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,})\b/ },
  { id: "SEC002", category: "secrets", severity: "warning", title: "Looks like an inline password",
    fix: "Move secrets out of instructions.",
    re: /\b(password|passwd|secret)\s*[:=]\s*["']?[^\s"']{6,}/i },

  // Excessive agency
  { id: "AGY001", category: "excessive_agency", severity: "blocking", title: "Destructive shell command",
    fix: "Remove rm -rf / force-push / DROP style commands, or require explicit human approval.",
    re: /\b(rm\s+-rf\s+[\/~]|git\s+push\s+(-f|--force)|DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE|mkfs\b|chmod\s+-R\s+777)/i },
  { id: "AGY002", category: "excessive_agency", severity: "warning", title: "Runs without asking for approval",
    fix: "Add a human-approval step before actions that change data, spend money or deploy.",
    re: /\b(without (asking|confirmation|approval)|automatically (deploy|delete|merge|pay|send))\b/i },
  { id: "AGY003", category: "excessive_agency", severity: "warning", title: "Wildcard tool access",
    fix: "List the specific tools this skill needs instead of granting everything.",
    re: /allowed[_-]tools\s*:\s*["']?\*|\ball tools\b/i },

  // Dangerous code
  { id: "COD001", category: "dangerous_code", severity: "warning", title: "Pipes a download straight into a shell",
    fix: "Download, inspect, then run — never curl | sh.",
    re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|python)\b/i },
  { id: "COD002", category: "dangerous_code", severity: "warning", title: "Uses eval on dynamic input",
    fix: "Avoid eval/exec on model-generated strings.",
    re: /\beval\s*\(|\bexec\s*\(/ },

  // Loop hazards
  { id: "LOP001", category: "loop_hazard", severity: "warning", title: "Unbounded retry instruction",
    fix: "Cap retries (e.g. 'retry at most 2 times, then stop and report').",
    re: /\b(keep (trying|retrying)|retry until|loop until|repeat until|never give up|until it (works|passes))\b/i },
];

const tokenEstimate = (s: string) => Math.ceil(s.length / 4);

export interface ScanResult {
  findings: Finding[];
  blocking: number;
  warnings: number;
  tokens: number;
  passed: Category[]; // categories with no findings
}

export function staticScan(content: string): ScanResult {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(rule.re);
      if (m) {
        findings.push({
          id: rule.id, category: rule.category, severity: rule.severity, title: rule.title, fix: rule.fix,
          line: i + 1, excerpt: lines[i].trim().slice(0, 140),
        });
        break; // one hit per rule is enough to act on
      }
    }
  }

  const tokens = tokenEstimate(content);
  const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(content);
  const hasDescription = /^description\s*:/m.test(content);
  if (content.trim().length < 80) {
    findings.push({ id: "HYG001", category: "hygiene", severity: "warning", title: "Too short to guide an agent",
      fix: "Describe when to use the skill, the steps, and what a good result looks like." });
  }
  if (hasFrontmatter && !hasDescription) {
    findings.push({ id: "HYG002", category: "hygiene", severity: "warning", title: "Frontmatter has no description",
      fix: "Add a one-line `description:` so agents know when to load this skill." });
  }
  if (!/\b(output|return|respond|format|result)\b/i.test(content)) {
    findings.push({ id: "HYG003", category: "hygiene", severity: "warning", title: "No expected output described",
      fix: "Say what the agent should produce (format, fields, length)." });
  }
  if (tokens > 5000) {
    findings.push({ id: "BUD001", category: "budget", severity: "warning", title: `Large skill (~${tokens.toLocaleString()} tokens)`,
      fix: "Split reference material into separate files loaded only when needed." });
  }

  const all: Category[] = ["injection", "exfiltration", "secrets", "excessive_agency", "dangerous_code", "loop_hazard", "hygiene", "budget"];
  const hit = new Set(findings.map((f) => f.category));
  return {
    findings,
    blocking: findings.filter((f) => f.severity === "blocking").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    tokens,
    passed: all.filter((c) => !hit.has(c)),
  };
}

export const CATEGORY_LABELS: Record<Category, string> = {
  injection: "Prompt injection",
  exfiltration: "Data exfiltration",
  secrets: "Secrets",
  excessive_agency: "Excessive agency",
  dangerous_code: "Dangerous code",
  loop_hazard: "Loop hazards",
  hygiene: "Clarity",
  budget: "Token budget",
};

export const RULE_COUNT = RULES.length + 4;
