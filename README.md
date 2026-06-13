# @modelbound/cli

The ModelBound command-line interface. Run token optimization, the full Skill Development Pipeline, tests, benchmarks, and version control on agent skills — locally or against your ModelBound cloud library — without leaving your terminal.

```bash
npm install -g @modelbound/cli
# or
npx @modelbound/cli --help

mb login        # device-code auth, no browser copy/paste
mb optimize ./skills/code-review.md
mb pipeline run --skill code-review
mb skill test code-review --model gpt-4o
mb skill versions code-review
mb skill diff code-review --from previous --to current
mb skill restore code-review <version-id>
mb health
```

The CLI is the same surface you'd get from the MCP server (`modelbound-mcp`) and the IDE extensions — pick whichever interface fits your workflow.

## Commands

| Command | Description |
|---|---|
| `mb login` / `mb logout` / `mb whoami` | Device-code auth. Token stored at `~/.modelbound/config.json` (0600). |
| `mb optimize <file\|skill>` | Run token optimization. `--apply` saves a new version. |
| `mb suggestions [--file id]` | List pending optimization suggestions. |
| `mb apply <suggestion-id...>` | Apply suggestions. |
| `mb pipeline run <skill>` | Run lint → trust → test → benchmark → optimize. |
| `mb pipeline status <run-id>` | Poll a pipeline run. |
| `mb skill test <skill>` | Run the test suite. |
| `mb skill benchmark <skill> --a <ver> --b <ver>` | Head-to-head benchmark. |
| `mb skill versions <skill>` | List versions (newest first). |
| `mb skill restore <skill> <version-id>` | Restore to a previous version (non-destructive). |
| `mb skill diff <skill> --from <ver> --to <ver>` | Unified diff between versions. |
| `mb health` | Check API connectivity, auth, and rate limits. |

## Configuration

| Env var | Purpose |
|---|---|
| `MODELBOUND_API_KEY` | Bypass `mb login` (useful in CI). |
| `MODELBOUND_API_URL` | Override API base (default `https://modelbound.co`). |
| `NO_COLOR` | Disable colored output. |

## Why a CLI?

ModelBound's web UI is the polished home for skill creation and team review, but a lot of work happens in terminals, CI, and pre-commit hooks. The CLI gives you the same token optimization and Skill Development Pipeline that the UI runs — scriptable, exit-code-clean, and friendly to GitHub Actions, GitLab CI, and Husky pre-commit hooks.

## License

MIT
