# Command reference

All commands accept the global flags: `--json`, `--quiet`, `--no-color`, `--profile <name>`, `--mcp-url <url>`.

Authentication uses `MODELBOUND_API_KEY` or the key stored via `modelbound auth login`. MCP calls default to `https://mcp.modelbound.co/mcp?source=cli`.

## auth
- `modelbound auth login [--api-key <key>]`
- `modelbound auth status`
- `modelbound auth logout`

## context
- `modelbound context set [--repo org/repo] [--path .]`

Sets workspace scoping (`set_workspace_context`) before skill operations. Repo is auto-detected from `git remote get-url origin` when omitted.

## sync
- `modelbound sync --file <path> [--repo org/repo]`
- `modelbound push <path>` (legacy edge sync)
- `modelbound pull <skill-id>`

`sync --file` calls `sync_skill_from_ide` and returns a repo-linked skill UUID.

## findings (Trust & Safety)
- `modelbound findings list --skill <file|slug|uuid>`
- `modelbound findings ignore --skill ... --key "<stable key>"`
- `modelbound findings unignore --skill ... --key "<stable key>"`

Alternative ignore/unignore: `--class`, `--severity`, `--message` instead of `--key`.

## Test & Optimize workflow

```bash
modelbound context set --repo org/repo
modelbound sync --file .modelbound/prompt-pr-contributor.md
modelbound findings list --skill .modelbound/prompt-pr-contributor.md
modelbound findings ignore --skill ... --key "escalation:critical:..."
modelbound pipeline run --skill ... --stage test_optimize
```

## pipeline
- `modelbound pipeline run --skill <file|slug|uuid> [--stage full|test_optimize|production] [--targets save,marketplace,claude_export] [--bump patch|minor|major|none] [--override-gate] [--no-watch]`
- `modelbound pipeline status --skill <file|slug|uuid>` or `--run <run-id>`

Pre-pipeline checklist (automatic): `set_workspace_context` → `sync_skill_from_ide` → `run_skill_pipeline`.

## test
- `modelbound test run --skill <file|slug|uuid> [--case <id>] [--prompt "…"]`
- `modelbound test create --skill <file|slug|uuid> --name "<name>" --prompt "<text>" [--notes "<text>"]`
- `modelbound test list --skill <file|slug|uuid>`
- `modelbound test seed --skill <file|slug|uuid> [--name ...] [--prompt ...] [--no-pipeline]`

`test seed` creates a test case + runs `test_optimize` pipeline (body snapshot) for new skills.

## benchmark / compare / suggest
- `modelbound benchmark --skill <file|slug|uuid>`
- `modelbound compare --skill ... [--from latest] [--to current]`
- `modelbound suggest --skill <file|slug|uuid>`

## version
- `modelbound version list --skill <file|slug|uuid>`
- `modelbound versions --skill <file|slug|uuid>` (alias)
- `modelbound version diff --skill ... --from <v> [--to <v>]`
- `modelbound version restore --skill ... --version <label>`

## optimize
- `modelbound optimize <path|skill-id> [--dry-run] [--intensity conservative|balanced|aggressive] [--no-apply] [--yes]`

## backup (local)
- `modelbound backup list`
- `modelbound backup restore <token>`
- `modelbound backup prune --days 30`

## repo
- `modelbound detect`
- `modelbound ls [--type skill|rule]`
- `modelbound lint <path>`
- `modelbound validate <path>`

## config
- `modelbound config get [key]`
- `modelbound config set <key> <value>`
- `modelbound config profiles`

## mcp
- `modelbound mcp print-config [--ide cursor|claude|copilot]`

## Backend blockers

See [BACKEND-BLOCKERS.md](./BACKEND-BLOCKERS.md) for known hosted-server issues that may affect pipeline, findings ignore, benchmark, compare, and suggest until Lovable deploys fixes.
