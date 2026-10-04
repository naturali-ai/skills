---
name: naturali-run-a-generation
description: Run a naturali.ai agent once, in the background (202 and a generation id to poll) or with wait=true for the result inline. Use when asked to run, call, test or ask a naturali agent something without a session, poll a generation, or when generate answers 502 AI_PROVIDER_ERROR, OUTPUT_SCHEMA_VALIDATION_FAILED, TEXT_ENCODED_TOOL_CALL, 503 model_not_priced, 402 insufficient_credit, 403 plan_limit_reached, 429 QUOTA_EXCEEDED, 409 IDEMPOTENCY_KEY_REUSED or 400 SYSTEM_MESSAGE_NOT_ALLOWED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/first-agent-generation
---

# Run a generation

Outcome: the agent's answer to your messages, and the `GENERATION` and
`TRACE` ids to read the run back with.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `AGENT` — a deployed agent, from `naturali-create-an-agent`.

Ids below are examples; use the ones your own calls return.

## 1a. Run in the background and poll

The default: the call answers `202 Accepted` at once and the work continues.
Right for anything that must respond fast.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What is our refund window?" }] }'
```

```json
{ "status": "accepted", "generation_id": "gen_GvfSi82dWIHZ2QuJ", "trace_id": "trace_YWhw2oowz6wCVN7N" }
```

```bash
export GENERATION=gen_GvfSi82dWIHZ2QuJ
export TRACE=trace_YWhw2oowz6wCVN7N
```

Poll until `status` leaves `in_progress`:

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "gen_GvfSi82dWIHZ2QuJ",
  "agent_id": "agent_wq7H4Ka1eDFVsBXM",
  "status": "completed",
  "stop_reason": "stop",
  "error": null,
  "agent_version": 1,
  "usage": { "cost_usd": 0.00000738, "input_tokens": 19, "output_tokens": 26 }
}
```

- `completed`; `requires_action` (a client tool waits on your code —
  `naturali-run-tools-in-your-own-code`); or `failed`, with `error.message`
  (usually a credential the vendor rejected or a model it cannot reach).
- The answer text is in the transcript (`naturali-read-a-run`).

## 1b. Or wait for the answer inline

`?wait=true` (CLI `--wait true`, SDK `query: { wait: true }`) holds the request
open and returns the finished result. Right for a script, wrong behind a
request that must answer in milliseconds.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Where is order 1001?" }] }'
```

```json
{
  "id": "gen_xNbNEQalLzlMvTkm",
  "trace_id": "trace_GjICOF5cL7NJ7Kjj",
  "status": "completed",
  "ai_provider_id": "aip_eHPAQ6qpUkB70D3N",
  "output": { "model": "glm-4.7-flash", "content": "I checked the order at …", "finish_reason": "stop" }
}
```

```bash
export GENERATION=gen_xNbNEQalLzlMvTkm
export TRACE=trace_GjICOF5cL7NJ7Kjj
```

- `ai_provider_id` is the provider that served `output.model`.
- `output.response_messages` holds the tool calls and results; a tool that
  failed shows as a `tool-result` with `output.type: "error-text"` while the
  run still reads `completed` — the tool failed, not the run.
- `output.object` carries the parsed reply when the agent has `output_schema`.

## Request and error notes

- `messages`: `user`/`assistant` turns, oldest first; nothing is remembered
  between calls, so send the whole history (or use
  `naturali-converse-in-a-session`). A `system` entry is `400
  SYSTEM_MESSAGE_NOT_ALLOWED`: put it in the agent's `instructions`.
- `action_id` labels the run on the usage meter; `metadata` is a caller-owned
  bag echoed on the generation record.
- `idempotency_key` makes a retry safe: a repeat runs nothing and answers `202`
  with the original generation; the same key with a changed body is `409
  IDEMPOTENCY_KEY_REUSED`.
- `"stream": true` answers SSE deltas ending `data: [DONE]`; a failure arrives
  as a final `data: {"error": …}` frame with no `[DONE]`. Not combinable with
  background mode.
- `502` on a waited call: `AI_PROVIDER_ERROR`, `OUTPUT_SCHEMA_VALIDATION_FAILED`
  (field named in the message) or `TEXT_ENCODED_TOOL_CALL` (`meta.tool_name`);
  `error.meta` carries `generation_id` and `trace_id` for `naturali-read-a-run`.
- Refused before anything runs: `503 model_not_priced` (managed model with no
  price yet; retry after the daily sync or pin another model), `402
  insufficient_credit` (billing owner's balance is negative; managed models
  only; zero still generates), `403 plan_limit_reached` with `resource: "runs"`
  (Free plan's monthly runs, your own key included), `429 QUOTA_EXCEEDED`
  (an enforced quota; `Retry-After` header).

Done when the generation reads `status: "completed"`.

## Related skills

- `naturali-read-a-run` — the transcript, error and trace of this run.
- `naturali-converse-in-a-session` — multi-turn history kept for you.
- `naturali-run-tools-in-your-own-code` — resume a `requires_action` run.
- `naturali-cap-project-spend` — the quotas behind `429 QUOTA_EXCEEDED`.
