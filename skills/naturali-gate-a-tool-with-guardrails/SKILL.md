---
name: naturali-gate-a-tool-with-guardrails
description: Declare a risky tool and a guardrail in a naturali.ai formation template and deploy them so small calls run on their own and large ones wait on the approvals queue, dry-run the guardrail, bind the gated tool to an agent, approve a held call and confirm the agent finished. Use when asked to gate, govern or put a threshold on a naturali tool, require human sign-off above an amount, write or evaluate a guardrail, attach a guardrail to a tool, list pending approvals, or approve or reject a held tool call.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/gate-a-tool-with-guardrails
---

# Gate a tool with guardrails

Outcome: an agent whose refund tool is governed — under $100 runs on its own, a
larger refund waits for a person — and one held refund approved and finished.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT`, `PROVIDER`, `FORMATION`, `AGENT` and its template `agent.yaml`
  (logical id `Agent`, parameter `ProviderId`), from
  `naturali-first-agent-generation`. This skill extends that template.
- `jq`, to put the template file into the JSON body.
- Guardrails and approvals need the **Pro** plan or above (the project owner's
  plan, not the caller's). Below it, a template declaring a guardrail,
  evaluating one and listing approvals answer `403 plan_feature_not_included`.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create the tool

An `http` tool posting to `httpbin.org`, which echoes back, so nothing moves.
Add to `agent.yaml` under `resources` and `outputs`:

```yaml
resources:
  RefundTool:
    type: tool
    properties:
      name: issue-refund
      type: http
      description: Refunds an order. amount is in US dollars.
      parameters:
        type: object
        properties:
          order_id:
            type: string
          amount:
            type: number
        required:
          - order_id
          - amount
      execute:
        url: https://httpbin.org/post
        method: POST
outputs:
  tool_id:
    ref: RefundTool
```

- Only when the user asks for direct calls: `POST …/tools` with the same
  properties as the body (CLI `naturali create-tool` · SDK
  `naturali.tools.createTool`).

## 2. Write the guardrail

`class` is one JSON Logic expression over the call's arguments: `A` (execute)
under $100, `C` (ask a person) otherwise. `default_class: "C"` sends anything
the expression does not anticipate to a person too. Add:

```yaml
resources:
  RefundSignOff:
    type: guardrail
    properties:
      name: Refund sign-off
      default_class: C
      class:
        if:
          - "<":
              - var: args.amount
              - 100
          - A
          - C
outputs:
  guardrail_id:
    ref: RefundSignOff
```

- In a template `class` and `default_class` sit directly on the properties;
  the direct route nests them in one `document` object.
- `expires_in` (the approval window, 24 hours by default) is not a guardrail
  template property.

Review the diff (creates nothing), then apply it:

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
  { "logical_id": "Agent", "resource_type": "agent", "action": "no-op" },
  { "logical_id": "RefundTool", "resource_type": "tool", "action": "create" },
  { "logical_id": "RefundSignOff", "resource_type": "guardrail", "action": "create" } ] }
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
  "outputs": { "agent_id": "agent_8xS50HUYsaFDGH11", "tool_id": "tool_NzCBgtWBAG7QkiaJ", "guardrail_id": "guard_WwusNpQOzrgblxuA" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Only when the user asks for direct calls: `POST …/guardrails` with `name`
  and `document: { default_class, class }` (CLI `naturali create-guardrail` ·
  SDK `naturali.guardrails.createGuardrail`).

```bash
export TOOL=tool_NzCBgtWBAG7QkiaJ
export GUARDRAIL=guard_WwusNpQOzrgblxuA
```

## 3. Dry-run it

Returns the record a real call would produce; nothing executes, nothing is filed.

CLI `naturali evaluate-guardrail` · SDK `naturali.guardrails.evaluateGuardrail`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/guardrails/$GUARDRAIL/evaluate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "args": { "order_id": "1002", "amount": 400 } }'
```

```json
{ "kind": "guardrail_evaluation", "class": "C", "decision": "route_to_approval", "context_snapshot": { "args.amount": 400 } }
```

- With `"amount": 40` the answer is `class: "A"`, `decision: "execute"`.

## 4. Attach it and bind the tool

Attach the guardrail to the **tool**, so it carries its gate to every agent it
is bound to, then bind the tool to the agent. The responses below come from an
agent with the `instructions` shown. Edit `agent.yaml`:

```yaml
resources:
  RefundTool:
    properties:
      # …as in step 1, plus:
      guardrail_ids:
        - ref: RefundSignOff
  Agent:
    properties:
      # …as before, plus:
      instructions: When asked to refund an order, call issue-refund once with the order id and the amount in US dollars, then report the result in one sentence.
      tool_bindings:
        - tool_id:
            ref: RefundTool
```

Plan and update with the same two calls as step 2; the plan shows `update` on
`RefundTool` and `Agent`.

- `tool_bindings` is the full set: list every tool the agent should keep.
- Only when the user asks for direct calls: `PATCH …/tools/{tool_id}` with
  `guardrail_ids` (CLI `naturali update-tool` · SDK `naturali.tools.updateTool`),
  then `PATCH …/agents/{agent_id}` with `tool_bindings` (CLI
  `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

## 5. Run a small and a large refund

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [{ "role": "user", "content": "Refund order 1001: $40." }] }'
```

```json
{ "id": "gen_yFTEPDBfXGNyQTN9", "status": "completed",
  "output": { "content": "The refund for order 1001 in the amount of $40 has been processed successfully." } }
```

`A`: the tool ran unattended. Now the same call for $400:

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [{ "role": "user", "content": "Refund order 1002: $400." }] }'
```

```json
{ "id": "gen_TBcvldVPdTcjWclu", "status": "completed",
  "output": { "content": "Refund request for order 1002 for $400 is pending approval with approval ID apr_diGdFF6EmxwsBlJ8." } }
```

```bash
export GENERATION=gen_TBcvldVPdTcjWclu
```

- The generation **completes** but the tool did not run: the agent got a
  `pending_approval` tool result and an item was filed on the approvals queue.

CLI `naturali list-approvals` · SDK `naturali.approvals.listApprovals`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/approvals?status=pending" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{
    "id": "apr_diGdFF6EmxwsBlJ8", "origin": "tool_call", "status": "pending",
    "proposed_action": { "tool_id": "tool_NzCBgtWBAG7QkiaJ", "action": "issue-refund",
                         "arguments": { "amount": 400, "order_id": "1002" } },
    "policy_version": "guard_WwusNpQOzrgblxuA@1",
    "expires_at": "2026-10-04T01:34:56.916Z"
  }],
  "total": 1
}
```

```bash
export APPROVAL=apr_diGdFF6EmxwsBlJ8
```

- `proposed_action.arguments` are frozen: approving executes exactly these.
- `policy_version` names the guardrail version that held the call.
- An item not settled by `expires_at` can never be approved.

## 6. Approve the held refund

CLI `naturali approve-approval` · SDK `naturali.approvals.approveApproval`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/approvals/$APPROVAL/approve" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

```json
{ "id": "apr_diGdFF6EmxwsBlJ8", "status": "approved", "resolved_by": "user_7x9yZtYrtTbPXbx0", "edited_arguments": null }
```

Approving runs the tool with the frozen arguments (the guardrail is not asked
again) and starts a continuation generation linked to the one that proposed
the call.

- Rejecting instead is `POST /v1/projects/{project_id}/approvals/{approval_id}/reject`
  with a `reason`: it runs nothing and tells the agent why.

CLI `naturali list-generations` · SDK `naturali.generations.listGenerations`

```bash
curl -sS \
  "$NATURALI_API/projects/$PROJECT/generations?initiator_generation_id=$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [{ "id": "gen_5EHZBqKyhI6h6O23", "initiator_generation_id": "gen_TBcvldVPdTcjWclu",
             "status": "completed", "stop_reason": "stop" }], "total": 1 }
```

Done when the continuation is `completed`: the held refund was executed and
the agent told. Its transcript opens with "Approval apr_diGdFF6EmxwsBlJ8 … was
approved. The action has been executed. Result: …" and ends with the agent's
reply.

## Related skills

- `naturali-pause-a-run-for-a-human-decision` — a fixed approval step in an orchestration, for a call that always needs a person.
- `naturali-limit-what-an-agent-may-do` — refuse an action outright with a boundary policy instead of asking a person.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
