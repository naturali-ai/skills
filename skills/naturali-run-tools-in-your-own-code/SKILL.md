---
name: naturali-run-tools-in-your-own-code
description: Give a naturali.ai agent a client tool that your own code runs - the generation pauses at requires_action, your code submits the result to tool-outputs, and it resumes. Use when an agent must reach a database, internal service or person the platform cannot, when asked for client-side or local function calling, to handle requires_action or required_action.tool_calls, submit tool outputs, or on 409 GENERATION_NOT_AWAITING_TOOL_OUTPUTS.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/run-tools-in-your-own-code
---

# Run tools in your own code

Outcome: an agent that calls a function your code runs — the generation
pauses with the call's arguments, you submit the result, and the agent
answers from it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with `Agent` in it and its id in
  `AGENT`, from `naturali-create-an-agent`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the function and give it to the agent

A `client` tool is a contract and nothing else: `name`, `description` and a
JSON Schema in `parameters`, with no `execute`. Nothing runs it server-side.
Add `OrderStatus` and edit `Agent` in `naturali.yaml`:

```yaml
resources:
  OrderStatus:
    type: tool
    properties:
      name: get-order-status
      type: client
      description: Looks up an order in the store database and returns its status.
      parameters:
        type: object
        properties:
          order_id: { type: string, description: 'The order id, e.g. ord_1042' }
        required: [order_id]
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id: { ref: Provider }
      instructions: >-                     # changed
        You answer questions about store orders. To learn an order's status,
        call get-order-status with its order_id, then answer from the result.
      tool_bindings:                       # added
        - tool_id: { ref: OrderStatus }
```

Apply it with `naturali-deploy-a-formation` (`create` on `OrderStatus`,
`update` on `Agent`).

- The model sees exactly the contract; argument keys come back to your code
  as you wrote them.
- `tool_bindings` is replaced wholesale: list every tool the agent keeps.
- Without a formation (only when the user asks): `POST …/tools` with the same
  properties (CLI `naturali create-tool` · SDK `naturali.tools.createTool`),
  then `PATCH …/agents/{agent_id}` with `instructions` and `tool_bindings`
  (CLI `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

## 2. Ask a question: the run pauses

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Where is my order ord_1042?" }] }'
```

```json
{
  "id": "gen_ZjWJKarBKQSbUFxB",
  "trace_id": "trace_Sm0VzE5mYDaDHhUA",
  "status": "requires_action",
  "required_action": {
    "type": "submit_tool_outputs",
    "tool_calls": [
      { "id": "tooluse_rbagPDjZvUZUrzrOQlAYAE", "tool_name": "get-order-status",
        "args": { "order_id": "ord_1042" } }
    ]
  }
}
```

```bash
export GENERATION=gen_ZjWJKarBKQSbUFxB
export CALL=tooluse_rbagPDjZvUZUrzrOQlAYAE
```

- Nothing is running now: the generation is parked, and
  `GET …/generations/$GENERATION` reads `requires_action` until you answer.
- The model decides whether to call the tool. If it answered without it, ask
  with the order id in the question, or force the call with `tool_choice`
  (see `naturali-give-an-agent-an-http-tool`).

## 3. Run the function and submit the result

Your code does the real work, then posts one entry per `tool_calls[].id`.
`output` can be any JSON value. The same generation resumes and answers.

CLI `naturali submit-agent-tool-outputs` · SDK `naturali.agents.submitAgentToolOutputs`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate/$GENERATION/tool-outputs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
        \"tool_outputs\": [{
          \"tool_call_id\": \"$CALL\",
          \"output\": { \"order_id\": \"ord_1042\", \"status\": \"shipped\", \"carrier\": \"DHL\", \"eta\": \"2026-10-07\" }
        }]
      }"
```

```json
{
  "id": "gen_ZjWJKarBKQSbUFxB",
  "status": "completed",
  "output": {
    "content": "Your order ord_1042 has been shipped! … Carrier: DHL … ETA: October 7, 2026 …",
    "finish_reason": "stop"
  }
}
```

- The carrier and date came from your `output`; nothing in the question or
  the instructions mentioned them.
- Each pause accepts outputs once: a second submit, or one to a generation
  that never paused, answers `409 GENERATION_NOT_AWAITING_TOOL_OUTPUTS`.
  Retry only a request that failed.
- A resumed generation can still fail with `502` (`AI_PROVIDER_ERROR`,
  `OUTPUT_SCHEMA_VALIDATION_FAILED`, `TEXT_ENCODED_TOOL_CALL`); it is then
  recorded `failed`.
- Inside a session the same loop answers
  `POST …/sessions/{session_id}/tool-outputs` (CLI
  `naturali submit-session-tool-outputs` · SDK
  `naturali.sessions.submitSessionToolOutputs`).

## 4. Validate it

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "gen_ZjWJKarBKQSbUFxB",
  "status": "completed",
  "stop_reason": "stop",
  "error": null,
  "usage": { "cost_usd": 0.00007468, "input_tokens": 524, "output_tokens": 95 }
}
```

- Same id that paused, now `completed`: the run resumed rather than starting
  over, and `usage` covers both halves.
- Resuming generates again, so it counts as a run on the plan like any other
  generation.
- A `client` tool cannot be called directly (`422`): there is no run to pause.

Done when the paused generation is `completed` and its reply uses the values
your code submitted.

## Related skills

- `naturali-give-an-agent-an-http-tool` — a tool the platform runs for you instead.
- `naturali-converse-in-a-session` — the same loop on a multi-turn session.
- `naturali-return-structured-output` — a constrained final answer after the tool call.
