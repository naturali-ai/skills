---
name: naturali-run-tools-in-your-own-code
description: Declare a client tool and its binding on a naturali.ai agent in a formation template and update the formation, so the agent calls a function your own code executes — the generation pauses at requires_action with the call's arguments, your code runs the function and submits the result with tool-outputs, and the agent finishes from it. Use when asked to create a client tool, call a local function or private database from an agent, handle requires_action or required_action.tool_calls, submit tool outputs, or let an agent use a service behind a firewall.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/run-tools-in-your-own-code
---

# Run tools in your own code

Outcome: an agent that calls a function your code runs — the generation pauses
at `requires_action` with the call's arguments, you execute the function,
submit the result, and the agent answers from it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT`, `PROVIDER`, `FORMATION`, `AGENT` and the `agent.yaml` template
  that deployed the agent, from `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare the function

A `client` tool is only a contract — `name`, `description`, JSON Schema
`parameters`, no `execute`. The model sees exactly this; argument keys come back
as you wrote them. Add it to `agent.yaml` under `resources`:

```yaml
  OrderStatus:
    type: tool
    properties:
      name: get-order-status
      type: client
      description: Looks up an order in the store database and returns its status.
      parameters:
        type: object
        properties:
          order_id:
            type: string
            description: The order id, e.g. ord_1042
        required: [order_id]
```

- Only when the user asks for direct calls: `POST …/tools` with the same
  properties (CLI `naturali create-tool` · SDK `naturali.tools.createTool`).

## 2. Give it to the agent

Bind the tool and say when to use it; `instructions` replaces the current ones.
In the same file, edit `Agent` and add an output:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: You answer questions about store orders. To learn an order's status, call get-order-status with its order_id, then answer from the result.
      tool_bindings:
        - tool_id:
            ref: OrderStatus
outputs:
  agent_id:
    ref: Agent
  tool_id:
    ref: OrderStatus
```

Plan, then apply:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [
    { "logical_id": "Agent", "action": "update", "physical_resource_id": "agent_iYkY1p2BROb7vQLT" },
    { "logical_id": "OrderStatus", "resource_type": "tool", "action": "create" } ] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -sS -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_iYkY1p2BROb7vQLT", "tool_id": "tool_IpZ6WO3CzlhcVtLY" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The update archives a new agent version.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` and `tool_bindings: [{ "tool_id": … }]` (CLI
  `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

```bash
export TOOL=tool_IpZ6WO3CzlhcVtLY
```

## 3. Ask a question: the run pauses

When the model calls a client tool, the answer is `status: "requires_action"`
and `required_action.tool_calls` lists each call's `id`, `tool_name` and `args`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [{ "role": "user", "content": "Where is my order ord_1042?" }] }'
```

```json
{
  "id": "gen_ZjWJKarBKQSbUFxB",
  "status": "requires_action",
  "required_action": {
    "type": "submit_tool_outputs",
    "tool_calls": [{ "id": "tooluse_rbagPDjZvUZUrzrOQlAYAE", "tool_name": "get-order-status", "args": { "order_id": "ord_1042" } }]
  }
}
```

```bash
export GENERATION=gen_ZjWJKarBKQSbUFxB
export CALL=tooluse_rbagPDjZvUZUrzrOQlAYAE
```

- The generation is parked: reading it shows `requires_action` until you answer.
- If the model answered without calling the tool, ask again with an order id
  in the question, or force the call with the agent's `tool_choice`.

## 4. Run the function and submit the result

Your code does the lookup and posts the result with the matching
`tool_call_id`. `output` can be any JSON value; the same generation resumes.

CLI `naturali submit-agent-tool-outputs` · SDK `naturali.agents.submitAgentToolOutputs`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate/$GENERATION/tool-outputs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
        \"tool_outputs\": [{
          \"tool_call_id\": \"$CALL\",
          \"output\": { \"order_id\": \"ord_1042\", \"status\": \"shipped\", \"carrier\": \"DHL\", \"eta\": \"2026-10-07\" }
        }]
      }"
```

```json
{ "id": "gen_ZjWJKarBKQSbUFxB", "status": "completed",
  "output": { "content": "Your order ord_1042 has been shipped! … Carrier: DHL … ETA: October 7, 2026", "finish_reason": "stop" } }
```

- Submit once per pause: posting outputs to an already completed generation
  runs the model again and answers `200` with a new reply. Retry only on a
  failed request.

## 5. Validate it

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "gen_ZjWJKarBKQSbUFxB", "agent_version": 3, "status": "completed", "stop_reason": "stop", "error": null,
  "usage": { "cost_usd": 0.00007468, "input_tokens": 524, "output_tokens": 95 } }
```

- Resuming generates again, so it counts as a run on your plan.

Done when the same generation id that paused is `completed` and its answer
carries the carrier and date that only your `output` supplied.

## Related skills

- `naturali-debug-a-failed-run` — an `http` tool that runs on the platform instead.
- `naturali-gate-a-tool-with-guardrails` — have a person approve a risky call first.
