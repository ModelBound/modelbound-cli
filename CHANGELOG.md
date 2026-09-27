# Changelog

## 0.3.6 — 2026-09-26

### Fixed
- Register `trace` and `harness` on the published `modelbound` / `mb` entrypoint (`dist/index.js`)

### Added
- `scripts/integration/run-cli-e2e.mjs` — full offline + optional cloud E2E harness (`npm run test:e2e:full`)

## 0.3.3 — 2026-07-03

### Added
- `modelbound skills list` — list cloud-synced skills via MCP (`list_skills`)
- `modelbound skill` command group wired into the main CLI entrypoint (`test`, `benchmark`, `versions`, `restore`, `diff`)

## 0.3.2 — 2026-07-02

### Fixed
- `modelbound pull` uses hosted MCP `get_skill` instead of removed `sync-cloud-pull` edge function (404)
- `modelbound optimize` on local skill files no longer sends filesystem `path` to `cli-optimize` (fixes `target_not_found`)

### Added
- Unit tests for skill/MCP parsing helpers (`npm test`)
- Integration harness under `scripts/integration/` (`npm run test:integration`)

## 0.2.0 — 2026-06-19

### Added (extension v1.9.16 / Test & Optimize parity)
- `modelbound context set` — workspace scoping via `set_workspace_context`
- `modelbound sync --file <path>` (positional path alias supported)
- `modelbound findings list|ignore|unignore` — Trust & Safety panel equivalents
- `modelbound benchmark --skill` — `benchmark_skill` MCP tool
- `modelbound compare --skill` — `compare_skill_versions` (sends both snake_case arg sets)
- `modelbound suggest --skill` — `suggest_skill_improvements`
- `modelbound pipeline run|status` — pre-flight sync + workspace context
- `modelbound test --skill`, `modelbound versions --skill`
- `modelbound health` — MCP reachability + auth status
- Top-level aliases: `login`, `logout`, `whoami`

### Changed
- MCP client parses SSE (`text/event-stream`) responses from hosted server
- `prepareSyncAuth` proceeds on transient auth-check failures (extension parity)
- Skill resolution from file paths under `.modelbound/`, `.cursor/rules/`, `.kiro/skills/`, `.claude/`, `.agents/skills/`
- Documented hosted-backend blockers in `docs/BACKEND-BLOCKERS.md`

## 0.1.0 — initial scaffold

- `modelbound auth login|logout|status` (device-code, reuses hosted `extension-device-auth`)
- `modelbound optimize <path|skill-id>` with `--dry-run`, `--intensity`, `--json`
- `modelbound pipeline run|status|last`
- `modelbound test <skill-id>` and `modelbound benchmark <skill-id>`
- `modelbound version list|diff|restore`
- `modelbound backup list|restore|prune` (local `.modelbound/backups/`)
- `modelbound push|pull|sync` for cloud↔local skill sync
- `modelbound detect|ls|lint|validate` repo helpers
- `modelbound mcp print-config` for IDE setup
- `modelbound config get|set` for profiles / defaults
- Global flags: `--json`, `--quiet`, `--no-color`, `--profile`
- All writes backed up to `.modelbound/backups/` (0600) with one-command restore
