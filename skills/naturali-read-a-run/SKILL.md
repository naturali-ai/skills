---
name: naturali-read-a-run
description: Read back what a naturali.ai agent run did - the generation record (status, stop_reason, error, agent_version, usage and cost), the step-by-step transcript with each tool call and its result or error, the trace tree of a multi-agent run, the runs that continued it, and the list of an agent's failed runs. Use when asked why an agent said something, what a run cost, which version answered, which tool call failed, to debug a failed or wrong run, find an agent's failed runs, follow a continuation after an approval or tool output, or when a transcript comes back empty with content_redacted_at set.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/debug-a-failed-run
---

# Read a run

Outcome: what a run was asked, what it called, what came back, how it ended,
which agent version served it and what it cost.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `GENERATION` and `TRACE` from `naturali-run-a-generation`, a `502`'s
  `error.meta`, or step 1.

Ids below are examples; use the ones your own calls return.

## 1. Find the run

A production failure is usually a background run nobody watched. List an
agent's runs:

CLI `naturali list-generations` · SDK `naturali.generations.listGenerations`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations?agent_id=$AGENT&status=failed&limit=20" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [{ "id": "gen_jOlNFyP9nMfqhPBq", "trace_id": "trace_yDTzcHKEA1G3pxp5", "status": "failed",
    "agent_version": 3, "error": { "code": "AI_PROVIDER_ERROR", "message": "Provider returned 404: …" } }],
  "total": 1, "limit": 20, "offset": 0 }
```

```bash
export GENERATION=gen_jOlNFyP9nMfqhPBq
export TRACE=trace_yDTzcHKEA1G3pxp5
```

- `status=failed` finds runs that stopped on an error. A run whose **tool**
  failed ends `completed`; only its transcript shows it.
- Other filters: `trace_id`, `session_id`, `actor_id`, `chain_id`,
  `initiator_generation_id`, `orchestration_run_id`, `node_id`, `status`
  (`in_progress`, `requires_action`, `completed`, `failed`); `limit`/`offset`.
- A failed agent run files no exception, so an empty exceptions list proves
  nothing.

## 2. Read the generation record

The outcome, the version and the cost.

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "gen_jOlNFyP9nMfqhPBq",
  "agent_id": "agent_6aMJbsbQ6Y2jdl20",
  "trace_id": "trace_yDTzcHKEA1G3pxp5",
  "agent_version": 2,
  "status": "completed",
  "stop_reason": "tool-calls",
  "error": null,
  "action_id": "tutorial.debug-a-failed-run",
  "chain_id": null,
  "usage": { "cost_usd": 0.0000176, "input_tokens": 160, "output_tokens": 16 }
}
```

- `error` is set only when the run itself stopped on a failure (e.g. `code:
  AI_PROVIDER_ERROR`), never for a failed tool inside it.
- `agent_version` pins a failure to the config change that introduced it.
- `stop_reason`: the vendor's (`stop`, `tool-calls`, `length`) or the
  platform's (`max_steps`, `depth_guard`, `chain_limit`, `error`).
- `cost_usd` is filled on a managed provider; on your own key it can be `null`.
- Tokens, cost, `started_by_principal_type` and `agent_version` survive even
  when content was never stored.

## 3. Read the transcript

The run as steps: input, each step's tool calls and results, output.

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "generation_id": "gen_jOlNFyP9nMfqhPBq",
  "agent_version": 2,
  "status": "completed",
  "stop_reason": "tool-calls",
  "step_count": 1,
  "input": [{ "role": "user", "content": "Is the service up?" }],
  "steps": [{
    "index": 0,
    "text": "",
    "finish_reason": "tool-calls",
    "tool_calls": [{ "id": "tooluse_7KnRKOeqjEVM4dBnASMvBm", "tool_name": "service-health", "args": {} }],
    "tool_results": [{
      "tool_call_id": "tooluse_7KnRKOeqjEVM4dBnASMvBm",
      "tool_name": "service-health",
      "result": null,
      "error": { "name": "HttpToolError", "status": 404, "method": "GET",
                 "url": "https://api.naturali.ai/v1/health", "body": "{\"error\":{\"code\":\"not_found\"}}" }
    }]
  }],
  "output": { "content": null, "finish_reason": "tool-calls" },
  "error": null
}
```

- `tool_calls` is what the model asked for; the matching `tool_results` entry
  carries either `result` or an `error` with the target's `status`, exact
  `url` and `method`, and the `body` it answered. One step with no tool calls
  is a plain answer.
- `input: null`, `steps: []`, `output: null` with `content_redacted_at` set is a
  `200`, not an error: `content_redacted_by_principal_id: "zero_retention"`
  means content was never stored (the marker predates `started_at`); a
  principal id means it was purged later. A still-running run also has empty
  `steps`; `status` tells them apart.

## 4. Read a multi-agent run

Any trace id in the tree returns the whole tree; `include=generations` embeds
each node's generations.

CLI `naturali get-trace-tree` · SDK `naturali.traces.getTraceTree`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/traces/$TRACE/tree?include=generations" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "trace_yDTzcHKEA1G3pxp5", "agent_id": "agent_6aMJbsbQ6Y2jdl20", "step_count": 1, "error": null,
  "generations": [{ "id": "gen_jOlNFyP9nMfqhPBq", "status": "completed" }],
  "children": [] }
```

The node carrying an `error` is the sub-agent that failed; `children` are the
traces its tool calls started.

## 5. Find the runs that continued it

A `requires_action` resumption, an approval's continuation or a `react`
approval expiry starts a **new** generation in the same continuation chain
rather than editing this one.

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations?initiator_generation_id=$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- `initiator_generation_id` returns every generation this one started:
  sub-agent calls, approval continuations, client-tool re-handoffs.
- `chain_id=<chain_id>` expands the whole chain; `chain_id` is `null` outside
  one. A chain that hit `max_chain_generations` ends with `stop_reason:
  "chain_limit"`.

Done when you can name the step, tool call or error that produced the outcome,
and the `agent_version` that served it.

## Related skills

- `naturali-run-a-generation` — start the run being read.
- `naturali-call-a-tool-directly` — isolate a failing tool from the agent.
- `naturali-settle-an-approval` — the approval whose continuation you followed.
- `naturali-stop-storing-conversation-content` — why a transcript can be empty.
