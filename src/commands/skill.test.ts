import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSkillsList } from "./skill.js";

test("renderSkillsList prints slug and id for each skill", () => {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    renderSkillsList({
      skills: [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          name: "review",
          description: "Review pull requests",
          repo: "ModelBound/cli",
          source_path: ".claude/skills/review/SKILL.md",
        },
      ],
    });
  } finally {
    process.stdout.write = orig;
  }
  const out = lines.join("");
  assert.match(out, /review/);
  assert.match(out, /aaaaaaaa/);
  assert.match(out, /ModelBound\/cli/);
});
