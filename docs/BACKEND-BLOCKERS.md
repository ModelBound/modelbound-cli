# Known hosted-backend blockers

These issues affect the CLI, MCP proxy, and Cursor extension equally. They require fixes on the Lovable-hosted backend (`https://mcp.modelbound.co`). The CLI surfaces these errors explicitly rather than swallowing them.

| Issue | Symptom | Root cause | Status |
|-------|---------|------------|--------|
| Pipeline JWT error | `Pipeline failed: Expected 3 parts in JWT; got 1` | `run-skill-pipeline` invoked with `actor_user_id` instead of `_actor: { user_id, team_id, source: "mcp" }` | Pending Lovable deploy |
| Pipeline status query | `column skill_pipeline_runs.version does not exist` | Status query selects `version` instead of `version_before`, `version_after` | Pending Lovable deploy |
| Ignore finding | `null value in column "team_id" of relation "skill_trust"` | `ignore_skill_finding` upsert missing `team_id` | Pending Lovable deploy |
| Benchmark / compare / suggest | `Unauthorized` | Internal edge calls missing `_actor` forwarding | Pending Lovable deploy |

## Workarounds

Until backend fixes land:

- **Pipeline**: errors include `Pipeline failed:` prefix — retry after Lovable deploys `_actor` fix.
- **Findings ignore/unignore**: may fail with team_id constraint — use findings list to verify; retry after deploy.
- **Benchmark, compare, suggest**: expect `Unauthorized` until internal invoke pattern is fixed.

## Correct internal invoke pattern (reference)

```typescript
fetch(`${SUPABASE_URL}/functions/v1/run-skill-pipeline`, {
  headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  body: JSON.stringify({
    skill_id,
    stage,
    targets,
    override_gates: !!override_gate,
    _actor: { user_id, team_id, source: "cli" | "mcp" },
  }),
});
```
