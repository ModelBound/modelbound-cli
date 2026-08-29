/**
 * Per-task scope budget defaults — mirrors modelbound/src/data/taskBudgets.ts
 * Override via `.modelbound/task-budgets.json` at repo root.
 */

export interface TaskBudget {
  min: number;
  max: number;
  warnAt: number;
  splitAt: number;
  guidance: string;
}

export interface TaskBudgetConfig {
  files: TaskBudget;
  loc: TaskBudget;
  features: TaskBudget;
}

export const DEFAULT_TASK_BUDGETS: TaskBudgetConfig = {
  files: {
    min: 1,
    max: 5,
    warnAt: 4,
    splitAt: 6,
    guidance:
      "Keep each task to 5 files or fewer. Going over is an early warning that you're doing too many things at once — split the task before coding.",
  },
  loc: {
    min: 10,
    max: 250,
    warnAt: 200,
    splitAt: 300,
    guidance:
      "Sized for one Claude/Cursor/Codex context window. Beyond ~250 LOC of changes per task, agents start losing precision and review quality drops.",
  },
  features: {
    min: 1,
    max: 1,
    warnAt: 1,
    splitAt: 2,
    guidance:
      "One feature per task. Bundling features makes rollback hard and reviews shallow. Ship one thing, then start a fresh task.",
  },
};

export function hasTaskScopeConstraint(content: string): boolean {
  if (!content) return false;
  if (/##\s*scope constraints/i.test(content)) return true;
  if (/<task-split>/i.test(content)) return true;
  const hasNumericLimit =
    /max files per task:\s*\d+/i.test(content) ||
    /max lines of code changed per task:\s*\d+/i.test(content) ||
    /max features per task:\s*\d+/i.test(content) ||
    (/(?:max|maximum|no more than|limit|up to|≤|<=)\s*\d+\s*(files?|loc|lines|features)/i.test(content) &&
      /(task|scope|change|edit|feature)/i.test(content));
  return hasNumericLimit;
}
