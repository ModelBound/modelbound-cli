# Integration tests

Live API tests for ModelBound CLI and cross-client skill sync. Requires `MODELBOUND_API_KEY` or `MB_TOKEN` in `modelbound-cli/.env`.

## Commands

```bash
npm run build
npm run test:integration          # sync + CLI matrix
npm run test:integration:sync     # phase 1–2 only
npm run test:integration:matrix   # phase 3 only (needs prior sync state)
```

Sibling repos used when present under the parent `modelbound/` folder:

- `modelbound-mcp-server` — cloud push/pull helper
- `modelbound-cursor-plugin` — `mb.mjs`
- `modelbound-claude-code-plugin` — built `push-skill.js`

## Phases

1. **Sync harness** — CLI/MCP/Cursor/Claude/extension paths, pull, optimize dry-run, test create/run/seed, cross-workspace overwrite check
2. **CLI matrix** — health, versions, findings, pipeline status, lint/validate; marks known backend blockers as expected failures (see `docs/BACKEND-BLOCKERS.md`)

Generated workspaces (`workspace/`, `workspace-alt/`) are gitignored.
