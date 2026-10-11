# Skill-attributed tracing

ModelBound links every step of an agent run to the skill and version that
shaped it, so you can see cost, speed and failures per skill and compare
versions. Failed runs become outcome reports in the Skill Feedback Loop.
Fixes are only ever suggested, never applied for you.

## What is sent

- Step name, kind (model, tool, retrieval), duration, token counts, status.
- `mb.skill_id` / `mb.skill_slug` and `mb.skill_version` on each step.
- **Never** prompts, completions or tool arguments. The server also drops them.
- Runs are kept for 30 days.

## Turning it on

Explicit reports (`report_run`, `mb trace`) always send. Automatic capture
of this tool's own calls is off until you set:

```bash
export MODELBOUND_TRACING=1
```

## Any other agent (OpenTelemetry)

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://api.modelbound.co/functions/v1/trace-ingest
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_TRACES_HEADERS=x-api-key=$MODELBOUND_API_KEY
```

Tag spans with `mb.skill_id` (or `mb.skill_slug`) and `mb.skill_version`.
Results appear under **Live runs** on the skill page. Full guide:
https://modelbound.co/guides/agent-tracing

## Decision skills (fast routing)

A skill can declare a decision contract in its frontmatter. ModelBound then tests it on a fast decision engine (TypeSafe Jev) instead of an LLM: exact-match grading, sub-second, no token cost.

```yaml
contract:
  type: decision
  decisions: [billing, technical, account, escalate]
  confidence_threshold: 0.8
  fallback: escalate
```

When your agent runs a decision step, report it with `kind: "decision"` plus the chosen label and confidence. Only the label is stored, never the input:

```json
{ "name": "route ticket", "kind": "decision", "decision": "billing", "confidence": 0.93, "duration_ms": 18, "skill_id": "ticket-router" }
```

OTLP users can set the span attributes `mb.decision` and `mb.confidence` instead. The Live runs panel then shows each label and compares decision steps with written-reply steps on time and tokens.
