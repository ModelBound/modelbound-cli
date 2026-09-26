# The agent harness

Four things decide whether an agent can be left alone with a task:

| Pillar | Question it answers |
|--------|--------------------|
| **Context** | Does it have the right instructions, inside budget? |
| **Permissions** | Can it only touch the tools it needs, with writes behind approval? |
| **Guardrails** | Are sensitive capabilities and spend explicitly bounded? |
| **Verification** | Do tests, evals and real-world reliability back it up? |

Stage 2 of the ModelBound skill pipeline evaluates all four as a deterministic
Safety check — no model call, no extra cost. A skill that fails it is
**supervised only**; one that passes is cleared for unattended runs.

Presets in `presets/harness.json` set the gates, approvals and budgets for the
three common postures: cautious, balanced, autonomous.
