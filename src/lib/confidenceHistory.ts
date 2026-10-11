import fs from "node:fs";
import path from "node:path";

export interface ConfidenceRun {
  ts: string;
  /** open issues (critical + warn) at this run */
  issues: number;
  tests_passed: number;
  tests_total: number;
  scanner_version: string;
}

export interface ConfidenceSummary {
  pass_rate: number | null;
  latest_issues: number | null;
  issues_delta: number | null;
  trend: "up" | "down" | "flat" | "unknown";
  runs: number;
}

const HISTORY_DIR = ".modelbound/skill-history";

export function historyPath(cwd: string, skillRelPath: string): string {
  const slug = skillRelPath.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return path.join(cwd, HISTORY_DIR, `${slug}.jsonl`);
}

export function appendRun(cwd: string, skillRelPath: string, run: ConfidenceRun): void {
  const file = historyPath(cwd, skillRelPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(run)}\n`, "utf8");
}

export function readRuns(cwd: string, skillRelPath: string): ConfidenceRun[] {
  const file = historyPath(cwd, skillRelPath);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ConfidenceRun);
}

export function summarizeConfidence(runs: ConfidenceRun[]): ConfidenceSummary {
  if (!runs.length) {
    return { pass_rate: null, latest_issues: null, issues_delta: null, trend: "unknown", runs: 0 };
  }
  const latest = runs[runs.length - 1];
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const pass_rate =
    latest.tests_total > 0 ? Math.round((latest.tests_passed / latest.tests_total) * 100) : null;
  const issues_delta = prev ? latest.issues - prev.issues : null;
  let trend: ConfidenceSummary["trend"] = "unknown";
  if (issues_delta !== null) {
    // fewer issues = improving
    if (issues_delta < 0) trend = "up";
    else if (issues_delta > 0) trend = "down";
    else trend = "flat";
  }
  return {
    pass_rate,
    latest_issues: latest.issues,
    issues_delta,
    trend,
    runs: runs.length,
  };
}
