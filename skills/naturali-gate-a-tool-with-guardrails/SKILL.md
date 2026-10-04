---
name: naturali-gate-a-tool-with-guardrails
description: Put a JSON Logic guardrail on a risky naturali.ai tool so small calls run on their own and large ones wait for a person. Use when asked to gate, govern or threshold a tool, require human sign-off above an amount, write, test or attach a guardrail, classify tool calls A/B/C/D, or on 403 plan_feature_not_included, a pending_approval tool result or a direct call refused with 422 TOOL_DISPATCH_FAILED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/gate-a-tool-with-guardrails
---

# Gate a tool with guardrails

Outcome: a refund tool that runs on its own under $100 and waits for a person
above it — proven by one call that executes and one that is held.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with an `http` tool `Refund`
  (`issue-refund`, shown in step 3) bound to `Agent`, from
  `naturali-give-an-agent-an-http-tool`; `AGENT` exported. The responses
  below come from an agent instructed: "When asked to refund an order, call
  issue-refund once with the order id and the amount in US dollars, then
  report the result in one sentence."
- The **Pro** plan or above (the project owner's, not the caller's). Below
  it, a template declaring a `guardrail`, evaluating one and listing
  approvals answer `403 plan_feature_not_included`; reading and deleting a
  guardrail stay open on every rung.

Ids below are examples; use the ones your own calls return.

## 1. Write the guardrail

A guardrail classifies one proposed call: `A` execute, `B` execute if `guard`
passes, `C` ask a person, `D` refuse. `class` is one JSON Logic expression —
no rule list. This one answers `A` under $100 and `C` otherwise. Add to
`naturali.yaml`:

```yaml
resources:
  RefundSignOff:
    type: guardrail
    properties:
      name: Refund sign-off
      default_class: C
      class:
        if:
          - { "<": [{ var: args.amount }, 100] }
          - A
          - C
outputs:
  guardrail_id: { ref: RefundSignOff }
```

Apply it with `naturali-deploy-a-formation` (one `create`), then:

```bash
export GUARDRAIL=guard_WwusNpQOzrgblxuA
```

- `default_class` (itself defaulting to `C`) applies whenever `class`
  returns anything but `A`–`D`: a guardrail that did not anticipate a call
  asks a person.
- `var` reads three namespaces only: `args.*` (the call's arguments),
  `context.*` (the caller's `guardrail_context`, keys verbatim — use
  snake_case) and `runtime.*` (platform metrics such as
  `runtime.tools.tool_calls.24h`). Anything else is refused `400` at write
  time; a missing value at evaluation fails closed.
- A missing `var` is falsy, so `{ "<": [{ var: args.amount }, 100] }` is
  **true** when `amount` is absent. Where that must not reach `A`, test
  presence: `{ and: [{ var: args.amount }, { "<": [{ var: args.amount }, 100] }] }`.
- In a template `class`, `default_class`, `guard` and `escalate` sit directly
  on the properties; the direct route nests them in one `document`.
  `expires_in` (the approval window, default 24 h) exists only in that
  `document`.
- Every `class`/`guard` change archives a new guardrail version; held items
  cite it as `policy_version`.
- Without a formation (only when the user asks): `POST …/guardrails` with
  `name` and `document: { default_class, class }` (CLI
  `naturali create-guardrail` · SDK `naturali.guardrails.createGuardrail`).

## 2. Dry-run it

Returns the exact record a real call would produce. Nothing executes, no
approval is filed.

CLI `naturali evaluate-guardrail` · SDK `naturali.guardrails.evaluateGuardrail`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/guardrails/$GUARDRAIL/evaluate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "args": { "order_id": "1002", "amount": 400 } }'
```

```json
{
  "kind": "guardrail_evaluation",
  "guardrail_id": "guard_WwusNpQOzrgblxuA",
  "guardrail_version": 1,
  "class": "C",
  "decision": "route_to_approval",
  "guard_result": null,
  "context_snapshot": { "args.amount": 400 }
}
```

- With `"amount": 40`: `class: "A"`, `decision: "execute"`.
- Also takes `guardrail_context` and a `tool_id` (to resolve
  `runtime.tools.*`).

## 3. Attach it to the tool

Attached to the **tool**, the gate follows it to every agent it is bound to.
Edit `Refund` in `naturali.yaml`:

```yaml
resources:
  Refund:
    type: tool
    properties:
      name: issue-refund
      type: http
      description: Refunds an order. amount is in US dollars.
      parameters:
        type: object
        properties:
          order_id: { type: string }
          amount: { type: number }
        required: [order_id, amount]
      execute: { url: 'https://httpbin.org/post', method: POST }
      guardrail_ids:                      # added
        - { ref: RefundSignOff }
```

Apply it with `naturali-deploy-a-formation` (one `update` on `Refund`).

- `guardrail_ids` on `Agent` governs every tool that agent calls; on the
  project (`PATCH /v1/projects/{project_id}`, needs `admin`) it is the floor
  under every tool call. Each array is replaced wholesale.
- Several guardrails on one call: the strictest decision wins (`blocked` >
  `tripwire` > `route_to_approval` > `execute`).
- Without a formation (only when the user asks): `PATCH …/tools/{tool_id}`
  with `guardrail_ids` (CLI `naturali update-tool` · SDK
  `naturali.tools.updateTool`).

## 4. Prove it: a small and a large refund

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Refund order 1001: $40." }] }'
```

```json
{ "id": "gen_yFTEPDBfXGNyQTN9", "status": "completed",
  "output": { "content": "The refund for order 1001 in the amount of $40 has been processed successfully." } }
```

`A`: the tool ran with nobody involved. The same call with
`"Refund order 1002: $400."`:

```json
{ "id": "gen_TBcvldVPdTcjWclu", "status": "completed",
  "output": { "content": "Refund request for order 1002 for $400 is pending approval with approval ID apr_diGdFF6EmxwsBlJ8." } }
```

```bash
export GENERATION=gen_TBcvldVPdTcjWclu
```

- The generation **completes** but the tool did not run: the agent got a
  `pending_approval` tool result and an item was filed on the approvals
  queue (`origin: "tool_call"`, `policy_version: "guard_WwusNpQOzrgblxuA@1"`,
  the frozen `arguments`). Settle it with `naturali-settle-an-approval`.
- A direct call of the gated tool (`naturali-call-a-tool-directly`) with a
  large amount answers `422 TOOL_DISPATCH_FAILED`: that route cannot wait
  for a person.
- `on_approval_expiry` on `Agent` decides what an unsettled item does when it
  expires: `terminate` (default) ends the chain, `react` tells the agent.

Done when the $40 call executes and the $400 call leaves a `pending` item.

## Related skills

- `naturali-settle-an-approval` — approve, edit or reject the held call and find the agent's continuation.
- `naturali-pause-a-run-for-a-human-decision` — a fixed approval step for a call that always needs a person.
- `naturali-limit-what-an-agent-may-do` — refuse an action outright with a boundary policy.
