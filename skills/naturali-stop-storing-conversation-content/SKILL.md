---
name: naturali-stop-storing-conversation-content
description: Declare a zero-retention naturali.ai agent (trace_content_mode none) in the formation template so its prompts, replies, tool arguments and results are never written, then prove it - its transcript is an empty skeleton while an ordinary agent's holds the conversation, and tokens and cost are still recorded. Use when asked for zero retention, not storing prompts or replies, PII or compliance-safe agents, no conversation logs, trace_content_mode, an empty transcript with content_redacted_by_principal_id zero_retention, or erasing content an agent already stored.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/keep-no-conversation-content
---

# Stop storing conversation content

Outcome: an agent whose prompts and replies are never written — proven by a
run that kept its tokens, cost and timing but no message, beside an ordinary
agent's run that kept everything.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with `Provider` in it, from
  `naturali-enable-naturali-models` or `naturali-bring-your-own-model-key`.
- `GENERATION` — a generation of an ordinary agent (the baseline), from
  `naturali-run-a-generation`.

Ids below are examples; use the ones your own calls return.

## 1. Declare a zero-retention agent

`trace_content_mode: none` means this agent's content — the messages it was
asked, every step, tool arguments and results, error payloads — is never
written. The setting lives on the agent; the project and its other agents are
left as they are. Add to `naturali.yaml`:

```yaml
resources:
  Intake:
    type: agent
    properties:
      name: intake-zero-retention
      ai_provider_id: { ref: Provider }
      instructions: Answer in one sentence. Never repeat personal data back.
      trace_content_mode: none
outputs:
  intake_agent_id: { ref: Intake }
```

Apply it with `naturali-deploy-a-formation` (one `create`), then:

```bash
export ZR_AGENT=agent_KX68YShE9FjK4yOv
```

| `trace_content_mode` | Meaning |
| --- | --- |
| `null` (default) | Inherit the project's mode |
| `none` | Zero-retention: content never written |
| `full` | Store, even when the project does not |

- An agent can tighten a storing project to `none`, never loosen a `none`
  project back to `full` (refused).
- To make an existing agent zero-retention, add the key to its resource
  instead; it takes a new version. Tightening stops future writes only:
  content already stored stays until purged with
  `DELETE …/generations/{generation_id}/content` (CLI
  `naturali purge-generation-content` · SDK
  `naturali.generations.purgeGenerationContent`), which leaves a skeleton
  marked with who erased it.
- For the whole project, `PATCH /v1/projects/{project_id}` with
  `trace_content_mode: none`, or a `trace_content_retention_days` window
  (ceiling set by the plan; needs `admin`).
- Without a formation (only when the user asks): `POST …/agents` with the
  same properties (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

## 2. Run it — the caller still gets the reply

Zero retention changes what is kept, not what the caller receives. Full
options in `naturali-run-a-generation`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$ZR_AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "My card ends in 4242. Is my payment late?" }] }'
```

```json
{
  "id": "gen_bFjYYBhB6XnnbqR5",
  "status": "completed",
  "output": {
    "content": "No, I do not have access to your payment information or the status of your account.",
    "finish_reason": "stop"
  }
}
```

```bash
export ZR_GENERATION=gen_bFjYYBhB6XnnbqR5
```

The reply is in this response and nowhere else.

## 3. Prove it against an ordinary agent

Read both transcripts. Other reads of a run (the generation record, traces)
are in `naturali-read-a-run`.

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$ZR_GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "generation_id": "gen_bFjYYBhB6XnnbqR5",
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

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "generation_id": "gen_1GPr5M1dYHdSjIJI",
  "status": "completed",
  "input": [{ "role": "user", "content": "What is our refund window?" }],
  "steps": [{ "index": 0, "text": "I am unsure of our refund window…", "finish_reason": "stop" }],
  "output": { "content": "I am unsure of our refund window…", "finish_reason": "stop" },
  "content_redacted_at": null,
  "content_redacted_by_principal_id": null
}
```

- A `200` skeleton, not an error: `input`, `steps` and `output` are empty;
  status, timing and `step_count` remain.
- `zero_retention` means the content was never stored; a later purge would
  name whoever erased it instead. `content_redacted_at` predates
  `started_at` because the marker is set when the row is created.
- `GET …/generations/$ZR_GENERATION` still carries `usage` (tokens,
  `cost_usd`), `agent_version` and who started it — the meter and the bill
  are untouched. `cost_usd` can be `null` on your own vendor credential.

Done when the zero-retention transcript is empty with
`content_redacted_by_principal_id: "zero_retention"` and the baseline holds
its messages.

## Related skills

- `naturali-read-a-run` — the generation record, transcript and trace of any run.
- `naturali-create-an-agent` — the ordinary agent the baseline came from.
