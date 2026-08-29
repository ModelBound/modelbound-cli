import matter from "gray-matter";
import { summarizeConfidence, readRuns, type ConfidenceSummary } from "./confidenceHistory.js";
import { buildReviewMeta, readSkillParts, type ReviewMeta } from "./skillReview.js";
import { scoreSkillTrust, SCANNER_VERSION, type TrustResult } from "./skillTrust.js";

export interface ServedSkillPayload {
  path: string;
  contents: string;
  version: string | null;
  trust_score: number;
  scanner_version: string;
  review_state: string;
  review_meta: ReviewMeta | null;
  confidence: ConfidenceSummary;
  trust: TrustResult;
}

function allowedTools(data: Record<string, unknown>): string[] {
  const raw = data["allowed-tools"] ?? data.allowed_tools;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  return [];
}

export function buildServedSkillPayload(
  cwd: string,
  relPath: string,
  raw: string,
): ServedSkillPayload {
  const { frontmatter, body, review_state } = readSkillParts(raw);
  const name = typeof frontmatter.name === "string" ? frontmatter.name : relPath;
  const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
  const version = typeof frontmatter.version === "string" ? frontmatter.version : null;
  const trust = scoreSkillTrust({
    name,
    description,
    body_md: body,
    allowed_tools: allowedTools(frontmatter),
  });
  const review_meta = buildReviewMeta(readSkillParts(raw).review, body);
  const confidence = summarizeConfidence(readRuns(cwd, relPath));

  return {
    path: relPath,
    contents: raw,
    version,
    trust_score: trust.total,
    scanner_version: trust.scanner_version ?? SCANNER_VERSION,
    review_state,
    review_meta,
    confidence,
    trust,
  };
}

export function parseSkillForTrust(raw: string, relPath: string): TrustResult {
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  return scoreSkillTrust({
    name: typeof fm.name === "string" ? fm.name : relPath,
    description: typeof fm.description === "string" ? fm.description : "",
    body_md: parsed.content,
    allowed_tools: allowedTools(fm),
  });
}
