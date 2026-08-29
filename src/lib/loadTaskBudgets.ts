import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TASK_BUDGETS, type TaskBudgetConfig } from "./taskBudgets.js";

const CONFIG_NAMES = [".modelbound/task-budgets.json", ".modelbound/config.json"];

/** Load task scope limits from repo config or defaults. */
export function loadTaskBudgets(cwd: string): TaskBudgetConfig {
  for (const rel of CONFIG_NAMES) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
      const scope = (raw.taskScope ?? raw.task_budgets ?? raw) as Partial<TaskBudgetConfig>;
      return {
        files: { ...DEFAULT_TASK_BUDGETS.files, ...scope.files, max: scope.files?.max ?? DEFAULT_TASK_BUDGETS.files.max },
        loc: { ...DEFAULT_TASK_BUDGETS.loc, ...scope.loc, max: scope.loc?.max ?? DEFAULT_TASK_BUDGETS.loc.max },
        features: {
          ...DEFAULT_TASK_BUDGETS.features,
          ...scope.features,
          max: scope.features?.max ?? DEFAULT_TASK_BUDGETS.features.max,
        },
      };
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_TASK_BUDGETS;
}
