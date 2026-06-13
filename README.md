# modelbound

> The ModelBound CLI — token optimization, skill pipeline, and version management from your terminal.

`modelbound` lets AI engineers run the same optimization and Skill Development Pipeline that powers the ModelBound web app — directly from their shell, CI, or git hooks. No web UI required.

```bash
npm i -g modelbound
modelbound auth login
modelbound optimize ./skills/code-review/SKILL.md --dry-run
modelbound pipeline run code-review --apply-optimization --bump patch
```

## Why a CLI?

ModelBound's job is to make AI agents more reliable and cheaper to run. Most of that work happens inside an editor, an MCP server, or a CI step — not a browser. This CLI is the lowest-friction way to:

- **Cut tokens** on a skill, rule, or whole repo with one command
- **Run the full Skill Development Pipeline** (Test → Optimize → Production) from CI
- **List, diff, and restore versions** without leaving the terminal
- **Sync skills** between your repo and your ModelBound team

## Safety model

Every command that mutates a local file writes a backup first:

```
.modelbound/backups/<relative-path>/<iso>-<sha7>.bak
```

Every summary line includes the one-command restore path. Cloud writes use the existing `file_versions` table — the version id is printed alongside the summary so you can roll back with `modelbound version restore`.

`pipeline run --apply-optimization` defaults to a dry-run + confirmation unless `--yes` is passed. Gates (trust, latency, tests) are never bypassed without explicit `--override-gates`.

## Commands

See [docs/commands.md](./docs/commands.md) for the full reference. Quick tour:

```bash
modelbound auth login                # device-code OAuth
modelbound detect                    # detect IDE layouts (cursor, claude, copilot, …)
modelbound optimize <path|skill-id>  # streams progress, writes backup
modelbound pipeline run <skill-id>   # full Test → Optimize → Production pipeline
modelbound version list <skill-id>
modelbound version restore <skill-id> <version>
modelbound push <path>               # local → cloud
modelbound pull <skill-id>           # cloud → local (backup first)
modelbound mcp print-config          # spit mcp.json for current IDE
```

Global flags: `--json`, `--quiet`, `--no-color`, `--profile <name>`.

## Configuration

`modelbound config` stores per-profile settings in `~/.config/modelbound/config.json` (via [`conf`](https://github.com/sindresorhus/conf)):

```bash
modelbound config set apiUrl https://api.modelbound.co
modelbound config set defaultIntensity balanced
modelbound config set autosync true
```

Auth tokens are stored in the OS keychain when available, falling back to the same `conf` file (0600).

## Working alongside the MCP server

This CLI shares its core (API client, backup engine, progress renderer) with [`@modelbound/modelbound-mcp-server`](https://github.com/ModelBound/modelbound-mcp-server). Anything you can do here you can also do via MCP tools (`optimization.*`, `pipeline.*`, `skill.*`). Pick whichever entrypoint fits your workflow — the safety guarantees are identical.

## Contributing

PRs welcome. Please open an issue first for anything non-trivial. CI runs lint, typecheck, and unit tests on every PR; security scans (Dependabot, CodeQL) run weekly.

## License

MIT
