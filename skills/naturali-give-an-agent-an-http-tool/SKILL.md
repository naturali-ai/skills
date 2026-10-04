---
name: naturali-give-an-agent-an-http-tool
description: Declare an http tool (URL with placeholders, method, headers, a JSON Schema for its arguments) in the naturali.ai formation template and bind it to the agent, optionally forcing the call with tool_choice and a has_tool_call stop condition, then prove the agent calls it. Use when an agent must call an API, webhook or HTTP endpoint, when asked to create, add or bind a naturali tool, put a token in a tool header, force a tool call, or when a write is refused with 422 FORCED_TOOL_CHOICE_CANNOT_STOP or a tool call fails with TOOL_EGRESS_BLOCKED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/deploy-a-system-from-a-template
---

# Give an agent an HTTP tool

Outcome: an `http` tool declared in the system and bound to `Agent`, which
calls it during a generation.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with `Agent` in it and its id in
  `AGENT`, from `naturali-create-an-agent`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the tool and bind it

The tool below calls `httpbin.org`, which echoes the request back — in your
system it is your order API. Add `Lookup` and edit `Agent` in `naturali.yaml`:

```yaml
resources:
  Lookup:
    type: tool
    properties:
      name: lookup-order
      type: http
      description: Looks up an order by its id.
      parameters:
        type: object
        properties:
          order_id: { type: string }
        required: [order_id]
      execute:
        url: https://httpbin.org/anything/orders/{order_id}
        method: GET
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id: { ref: Provider }
      instructions: >-                     # changed
        You answer questions about orders. Look the order up with
        lookup-order before answering, and say which URL you checked.
      tool_bindings:                       # added
        - tool_id: { ref: Lookup }
outputs:
  tool_id: { ref: Lookup }
```

Apply it with `naturali-deploy-a-formation`. The plan shows `create` on
`Lookup` and `update` on `Agent`. Then:

```bash
export TOOL=tool_8Vfntfb4p4z2goON
```

- `name` is what the model calls and what `tool_choice` and
  `stop_conditions` name; `description` and `parameters` are all the model
  sees, so write them the way you want it to call the endpoint.
- `execute.url` takes `{param}` placeholders filled from the arguments;
  `method` defaults to `POST`.
- The resolved arguments are always sent as the request body, even on `GET`.
  Most servers ignore it; a target that rejects a `GET` with a body fails
  every call — use its `POST` route if it has one.
- A credential goes in a `no_echo` parameter, never inline:

  ```yaml
  parameters:
    ApiToken: { type: string, no_echo: true }
  resources:
    Lookup:
      properties:
        execute:
          # …url and method as above, plus:
          headers:
            Authorization: { sub: 'Bearer ${ApiToken}' }
  ```

- `tool_bindings` is replaced wholesale: list every tool the agent keeps.
- A tool reaches the public internet only; a private or internal address is
  refused with `403 TOOL_EGRESS_BLOCKED` unless the deployment allows it.
- Check the URL and headers with `naturali-call-a-tool-directly` before an
  agent relies on the tool.
- Without a formation (only when the user asks): `POST …/tools` with the same
  properties (CLI `naturali create-tool` · SDK `naturali.tools.createTool`),
  then `PATCH …/agents/{agent_id}` with `tool_bindings: [{ "tool_id" }]` (CLI
  `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

### Force the call (optional)

To make every step call a tool — e.g. to reproduce a tool failure on the
first try — add to `Agent`:

```yaml
      tool_choice: required                                        # added
      stop_conditions:                                             # added
        - { type: has_tool_call, tool_name: lookup-order }
```

- A forcing `tool_choice` (`required` or `{ type: tool, tool_name: … }`)
  without a `has_tool_call` stop condition naming a tool it can produce is
  refused with `422 FORCED_TOOL_CHOICE_CANNOT_STOP`.
- The stop condition ends the turn right after the call, so `output.content`
  is empty. To force only the first step and leave the agent's own strategy
  afterwards, use `step_rules` instead:
  `[{ step: 1, tool_choice: { type: tool, tool_name: lookup-order } }]`.

## 2. Prove the agent calls it

One generation; full options in `naturali-run-a-generation`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Where is order 1001?" }] }'
```

```json
{
  "id": "gen_xNbNEQalLzlMvTkm",
  "status": "completed",
  "output": {
    "content": "I checked the order at URL: https://httpbin.org/anything/orders/1001 …",
    "finish_reason": "stop"
  }
}
```

- A failing tool does not fail the run: its error goes back to the model as
  an `error-text` tool result and the generation still ends `completed`.
  Find the failing call with `naturali-read-a-run` and isolate it with
  `naturali-call-a-tool-directly`.

Done when the reply names the URL the tool called.

## Related skills

- `naturali-call-a-tool-directly` — run the tool with no agent to tell a broken tool from a model misusing it.
- `naturali-gate-a-tool-with-guardrails` — make large or risky calls wait for a person.
- `naturali-run-tools-in-your-own-code` — a tool your own code runs instead of an HTTP endpoint.
