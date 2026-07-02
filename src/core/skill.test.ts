import assert from "node:assert/strict";
import test from "node:test";
import {
  isErrorSkillContent,
  isSkillFile,
  isUuid,
  parseSkillMcpPayload,
  resolveSkillFromPath,
  slugFromPath,
} from "./skill.ts";

test("slugFromPath strips extension from .modelbound paths", () => {
  assert.equal(slugFromPath(".modelbound/my-skill.md"), "my-skill");
});

test("slugFromPath uses directory name for Copilot SKILL.md layout", () => {
  assert.equal(slugFromPath(".agents/skills/review/SKILL.md"), "review");
});

test("resolveSkillFromPath treats UUID targets as cloud ids", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  const t = resolveSkillFromPath("/tmp/ws", id);
  assert.equal(t.skillId, id);
  assert.equal(t.slug, "a1b2c3d4");
});

test("resolveSkillFromPath resolves relative skill files under cwd", () => {
  const t = resolveSkillFromPath("/tmp/ws", ".modelbound/foo.md");
  assert.equal(t.relativePath, ".modelbound/foo.md");
  assert.equal(t.slug, "foo");
  assert.equal(t.sourceIde, "modelbound");
});

test("isUuid validates UUID shape", () => {
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("a1b2c3d4-e5f6-4789-a012-3456789abcde"), true);
});

test("isSkillFile detects supported skill paths", () => {
  assert.equal(isSkillFile(".cursor/rules/foo.mdc"), true);
  assert.equal(isSkillFile("README.md"), false);
});

test("parseSkillMcpPayload parses markdown string payloads", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  const parsed = parseSkillMcpPayload("# Hello\n\nMarker: v2", id);
  assert.match(parsed!.content, /Marker: v2/);
  assert.equal(parsed!.skillId, id);
});

test("parseSkillMcpPayload parses structured body_md responses", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  const parsed = parseSkillMcpPayload(
    {
      skill_id: id,
      slug: "my-skill",
      source_path: ".modelbound/my-skill.md",
      body_md: "---\nname: x\n---\n\nbody",
    },
    id,
  );
  assert.equal(parsed!.slug, "my-skill");
  assert.equal(parsed!.sourcePath, ".modelbound/my-skill.md");
  assert.match(parsed!.content, /body/);
});

test("parseSkillMcpPayload rejects error-shaped content", () => {
  assert.equal(parseSkillMcpPayload("Skill not found", "id"), null);
  assert.equal(isErrorSkillContent("Error: boom"), true);
});
