import type { TaskBudgetConfig } from "./taskBudgets.js";
import { DEFAULT_TASK_BUDGETS } from "./taskBudgets.js";

/** Recommended scope-constraint block injected into new skills by default. */
export function buildScopeConstraintBlock(budgets: TaskBudgetConfig = DEFAULT_TASK_BUDGETS): string {
  return `
## Scope Constraints (hard limits — split task if exceeded)

- **Max files per task:** ${budgets.files.max}
- **Max lines of code changed per task:** ${budgets.loc.max}
- **Max features per task:** ${budgets.features.max}

If any of these would be exceeded, STOP and produce a split plan instead of writing code:

<task-split>
  <reason>Why this exceeds scope</reason>
  <subtasks>
    <task name="..." files="..." exit-criteria="..." />
  </subtasks>
</task-split>
`.trimStart();
}
