import assert from "node:assert/strict";
import test from "node:test";
import { extractMcpError, parseToolResult } from "./mcp.ts";

test("extractMcpError surfaces MCP_ERROR prefix text", () => {
  assert.equal(extractMcpError("[MCP_ERROR] skill missing"), "skill missing");
});

test("extractMcpError reads structured error payloads", () => {
  assert.equal(extractMcpError("", { error: "bad request" }), "bad request");
});

test("parseToolResult returns structuredContent when present", () => {
  const out = parseToolResult({
    structuredContent: { skill_id: "abc", body_md: "hello" },
  });
  assert.deepEqual(out, { skill_id: "abc", body_md: "hello" });
});

test("parseToolResult parses JSON text content", () => {
  const out = parseToolResult({
    content: [{ type: "text", text: '{"ok":true}' }],
  });
  assert.deepEqual(out, { ok: true });
});

test("parseToolResult returns plain text when JSON parse fails", () => {
  const out = parseToolResult({
    content: [{ type: "text", text: "# markdown skill" }],
  });
  assert.equal(out, "# markdown skill");
});

test("parseToolResult throws on isError results", () => {
  assert.throws(
    () =>
      parseToolResult({
        isError: true,
        content: [{ type: "text", text: "[MCP_ERROR] failed" }],
      }),
    /failed/,
  );
});
