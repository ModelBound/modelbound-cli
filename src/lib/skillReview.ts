import { createHash } from "node:crypto";
import matter from "gray-matter";
import { SCANNER_VERSION } from "./skillTrust.js";

export type ReviewState = "draft" | "pending_review" | "approved" | "rejected";

export interface ReviewRecord {
  state: ReviewState;
  reviewed_by?: string;
  reviewed_at?: string;
  approved_hash?: string;
  approved_trust?: number;
  scanner_version?: string;
  notes?: string;
}

export interface ReviewMeta {
  reviewed_by?: string;
  reviewed_at?: string;
  approved_hash?: string;
  approved_trust?: number;
  scanner_version?: string;
  notes?: string;
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function parseReview(data: Record<string, unknown>): ReviewRecord | null {
  const raw = data.review;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.state;
  if (typeof state !== "string") return null;
  if (!["draft", "pending_review", "approved", "rejected"].includes(state)) return null;
  return {
    state: state as ReviewState,
    reviewed_by: typeof r.reviewed_by === "string" ? r.reviewed_by : undefined,
    reviewed_at: typeof r.reviewed_at === "string" ? r.reviewed_at : undefined,
    approved_hash: typeof r.approved_hash === "string" ? r.approved_hash : undefined,
    approved_trust: typeof r.approved_trust === "number" ? r.approved_trust : undefined,
    scanner_version: typeof r.scanner_version === "string" ? r.scanner_version : undefined,
    notes: typeof r.notes === "string" ? r.notes : undefined,
  };
}

export function effectiveReviewState(body: string, review: ReviewRecord | null): ReviewState {
  if (!review) return "draft";
  if (review.state === "approved") {
    const current = hashBody(body);
    if (review.approved_hash && review.approved_hash !== current) return "draft";
  }
  return review.state;
}

export function buildReviewMeta(review: ReviewRecord | null, body: string): ReviewMeta | null {
  if (!review) return null;
  const state = effectiveReviewState(body, review);
  if (state === "draft" && review.state === "approved") {
    return {
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      approved_hash: review.approved_hash,
      approved_trust: review.approved_trust,
      scanner_version: review.scanner_version ?? SCANNER_VERSION,
      notes: review.notes ?? "Body modified since approval — reset to draft.",
    };
  }
  if (state === "approved" || state === "rejected" || state === "pending_review") {
    return {
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      approved_hash: review.approved_hash,
      approved_trust: review.approved_trust,
      scanner_version: review.scanner_version ?? SCANNER_VERSION,
      notes: review.notes,
    };
  }
  return null;
}

export function serializeReview(review: ReviewRecord): Record<string, unknown> {
  return { review: { ...review } };
}

export function applyReviewToFile(raw: string, patch: Partial<ReviewRecord>): string {
  const parsed = matter(raw);
  const existing = parseReview(parsed.data as Record<string, unknown>) ?? { state: "draft" as ReviewState };
  const merged: ReviewRecord = { ...existing, ...patch };
  const next = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined),
  ) as ReviewRecord;
  const data = { ...(parsed.data as Record<string, unknown>) };
  data.review = next;
  return matter.stringify(parsed.content, data);
}

export function readSkillParts(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
  review: ReviewRecord | null;
  review_state: ReviewState;
} {
  const parsed = matter(raw);
  const body = parsed.content;
  const review = parseReview(parsed.data as Record<string, unknown>);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body,
    review,
    review_state: effectiveReviewState(body, review),
  };
}

export function ciBlocksMerge(reviewState: ReviewState): boolean {
  return reviewState !== "approved";
}
