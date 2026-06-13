# Command reference

All commands accept the global flags: `--json`, `--quiet`, `--no-color`, `--profile <name>`.

## auth
- `modelbound auth login [--api-key <key>]`
- `modelbound auth status`
- `modelbound auth logout`

## optimize
- `modelbound optimize <path|skill-id> [--dry-run] [--intensity conservative|balanced|aggressive] [--no-apply] [--yes]`

Local files are backed up to `.modelbound/backups/` before write. Output prints the backup token and the cloud `version_id` (when applicable).

## pipeline
- `modelbound pipeline run <skill-id> [--targets a,b] [--bump patch|minor|major|none] [--apply-optimization] [--override-gates] [--changelog "…"] [--no-watch]`
- `modelbound pipeline status <run-id>`
- `modelbound pipeline last <skill-id>`

## test
- `modelbound test <skill-id> [--case <id>] [--prompt "…"]`
- `modelbound benchmark <skill-id>`

## version
- `modelbound version list <skill-id>`
- `modelbound version diff <skill-id> <a> <b>`
- `modelbound version restore <skill-id> <version>`

## backup (local)
- `modelbound backup list`
- `modelbound backup restore <token>`
- `modelbound backup prune --days 30`

## sync
- `modelbound push <path>`
- `modelbound pull <skill-id>`
- `modelbound sync`

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
