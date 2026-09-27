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

## Feedback loop

Everything above acts on a skill *before* it runs. `mb report` records what
happened *after* — the missing half of skill accuracy.

```bash
mb report write-migration --verdict failed --category ignored_rule --note "No GRANT statements"
cat bad-output.txt | mb report write-migration --verdict partial --paste
mb reliability --days 30
```

Verdicts: `worked | partial | failed`.
Categories: `ignored_rule, out_of_scope, wrong_tool, hallucinated, wrong_format, too_vague, other`.

Repeated failures with the same category are grouped in ModelBound, diagnosed,
and turned into a proposed minimal edit plus a regression test you accept or
reject at <https://modelbound.co/skills/attention>.

## The agent harness

An agent can be left alone with a task when four things hold: context, permissions, guardrails, verification.
Stage 2 of the pipeline checks all four deterministically — no model call.

```bash
mb harness write-migration          # summary, exits non-zero on a failing gate
mb harness write-migration --strict # cautions fail too
mb harness write-migration --json   # for CI
```

The same result appears inside `mb pipeline` and `mb audit` output. Presets for
the three common postures live in `presets/harness.json`.

## Use in CI

Run the same checks on every pull request. Add `MODELBOUND_API_KEY` as a repository secret, then:

```yaml
# .github/workflows/modelbound.yml
name: ModelBound
on: [pull_request]
jobs:
  skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx -y modelbound pipeline run --skill code-review
        env:
          MODELBOUND_API_KEY: ${{ secrets.MODELBOUND_API_KEY }}
```

Commands exit non-zero when a check fails, so the job blocks the merge. Prefer a ready-made action? Use [`ModelBound/skill-check-action`](https://github.com/ModelBound/skill-check-action).

## Tracing a run

Record any command as a traced run for a skill. Only the command name,
duration and exit status are sent, never output.

```bash
mb trace --skill deploy-checklist -- npm run deploy
mb trace --skill deploy-checklist --version 1.4.0 --category wrong_tool -- ./run-agent.sh
```

Failed runs become outcome reports on the skill. See `docs/TRACING.md`.
