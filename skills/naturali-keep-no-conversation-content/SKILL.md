---
name: naturali-keep-no-conversation-content
description: Declare a naturali.ai zero-retention agent, whose prompts and replies are never stored, in a formation template and deploy it, run it, and prove its transcript is an empty skeleton while tokens, cost and timing survive, compared against an ordinary agent's stored run. Use when asked for a zero-retention or no-logging naturali agent, to stop storing conversation content or personal data, to set trace_content_mode to none, or to check that a run kept no content for a compliance or privacy review.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/keep-no-conversation-content
---

# Run a zero-retention agent

Outcome: an agent whose prompts and replies are **never written** — proven by
a run that kept its tokens, cost and timing but no message, beside an ordinary
agent's run that kept everything.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, from
  `naturali-enable-naturali-models` or `naturali-create-a-provider`.
- `GENERATION` — a generation of an ordinary agent, the one
  `naturali-first-agent-generation` ends with. It is the baseline in step 5.
- `jq`, to put the template file into the JSON body.

The setting lives on the agent; the project and its other agents are untouched.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create a zero-retention agent

`trace_content_mode: none`: messages, steps, tool arguments and results are
never written.

- `null` inherits the project; `full` stores even when the project does not.
  An agent can tighten a storing project to `none`, never loosen a `none`
  project back to `full`.

Save as `zero-retention.yaml`:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Agent:
    type: agent
    properties:
      name: intake-zero-retention
      ai_provider_id:
        param: ProviderId
      instructions: Answer in one sentence. Never repeat personal data back.
      trace_content_mode: none
outputs:
  agent_id:
    ref: Agent
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t zero-retention.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t zero-retention.yaml --arg p "$PROVIDER" \
        '{name: "intake-zero-retention", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_KX68YShE9FjK4yOv" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Only when the user asks for direct calls: `POST …/agents` with the same
  properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

```bash
export ZR_FORMATION=form_EPis15Nfukary167
export AGENT=agent_KX68YShE9FjK4yOv
```

## 2. Run a generation

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "My card ends in 4242. Is my payment late?" }] }'
```

```json
{ "id": "gen_bFjYYBhB6XnnbqR5", "status": "completed",
  "output": { "content": "No, I do not have access to your payment information or the status of your account.", "finish_reason": "stop" } }
```

- The caller still receives the reply — in this response and nowhere else.

```bash
export ZR_GENERATION=gen_bFjYYBhB6XnnbqR5
```

## 3. Read the transcript back

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$ZR_GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "started_at": "2026-10-03T09:33:23.251Z",
  "step_count": 1,
  "input": null,
  "steps": [],
  "output": null,
  "content_redacted_at": "2026-10-03T09:33:23.245Z",
  "content_redacted_by_principal_type": "system",
  "content_redacted_by_principal_id": "zero_retention"
}
```

- A `200` skeleton, not an error: status, timing and `step_count` remain.
- `zero_retention` means **never stored**; a later purge would name whoever
  erased it instead. `content_redacted_at` predates `started_at` because the
  marker is set when the row is created.

## 4. Read the generation record

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$ZR_GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "gen_bFjYYBhB6XnnbqR5",
  "status": "completed",
  "agent_version": 1,
  "started_by_principal_type": "api_key",
  "content_redacted_by_principal_id": "zero_retention",
  "usage": { "cost_usd": 9.77e-6, "input_tokens": 31, "output_tokens": 19 }
}
```

- `cost_usd` is filled on a naturali-managed provider; on your own credential
  your vendor bills the tokens and it can be `null`.

## 5. Validate it against an ordinary agent

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "step_count": 1,
  "input": [{ "role": "user", "content": "What is our refund window?" }],
  "steps": [{ "index": 0, "text": "I am unsure of our refund window; …", "finish_reason": "stop" }],
  "output": { "content": "I am unsure of our refund window; …", "finish_reason": "stop" },
  "content_redacted_at": null,
  "content_redacted_by_principal_id": null
}
```

Done when the baseline transcript holds what it was asked and answered while
the zero-retention one has `input: null`, `steps: []`, `output: null` and
`content_redacted_by_principal_id: "zero_retention"` — not even the card digits
— and its generation record still carries `usage`.

## Related skills

- `naturali-first-agent-generation` — the ordinary agent and baseline generation compared here.
- `naturali-debug-a-failed-run` — reading transcripts, where an empty `steps` is explained by `content_redacted_at`.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
