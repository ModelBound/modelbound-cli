# Changelog

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
