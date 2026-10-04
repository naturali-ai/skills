---
name: naturali-branch-an-orchestration
description: Make a naturali.ai orchestration choose its own path - a triage agent with an output_schema classifies each message and a condition node sends it to only the matching agent - and prove it with two runs that took different branches. Use when asked to route or branch on a classification, add a condition node or conditional edges, send refunds and general questions to different agents, read a structured field with output.object, or understand why a node shows as skipped in node_executions.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/branch-an-orchestration
---

# Branch an orchestration

Outcome: a `support-triage` orchestration that classifies each customer message
and sends it to the refunds agent or the general agent, never both, proven by
two runs whose records show the branch taken as `completed` and the other as
`skipped`.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Provider` in `naturali.yaml`, deployed as `$FORMATION` with
  `naturali-deploy-a-formation`.
- How `nodes`, `edges`, `input_mapping` and `state_mapping` fit together, from
  `naturali-orchestrate-several-agents`.
- Only nodes that execute generate: each run here is two runs against the plan
  (the triage and the one reply). A skipped node costs nothing.

Ids below are examples; use the ones your own calls return.

## 1. Declare the three agents

The triage agent answers with a structured `category` instead of prose: its
`output_schema` (see `naturali-return-structured-output`) limits it to `refund`
or `other`, so the branch reads a field, not a sentence. Add to
`naturali.yaml`:

```yaml
resources:
  Triage:
    type: agent
    properties:
      name: support-triage
      ai_provider_id: { ref: Provider }
      instructions: "You receive a customer message. Classify it: refund if the customer asks for their money back, other for anything else."
      output_schema:
        type: object
        properties:
          category: { type: string, enum: [refund, other] }
        required: [category]
  Refunds:
    type: agent
    properties:
      name: support-refunds
      ai_provider_id: { ref: Provider }
      instructions: "You answer refund requests for a bakery. Refunds: custom cakes within 48 hours of pickup with the receipt; bread and pastries are exchange only, same day. Reply in at most two sentences."
  General:
    type: agent
    properties:
      name: support-general
      ai_provider_id: { ref: Provider }
      instructions: You answer general questions for a bakery open 7am to 6pm, Monday to Saturday. Reply in at most two sentences.
outputs:
  triage_id: { ref: Triage }
  refunds_id: { ref: Refunds }
  general_id: { ref: General }
```

Apply it with `naturali-deploy-a-formation` and export the ids from `outputs`:

```bash
export TRIAGE=agent_i4N8yGO6JtCTL29R
export REFUNDS=agent_0aaNr99iJ4yHxpAk
export GENERAL=agent_lYHV0xJwhYKrzemY
```

## 2. Validate the branching graph

- `triage` writes `category`. With a schema the parsed answer is
  `output.object`, so the field is `output.object.category`, not
  `output.content`.
- `route` is a `condition` node: its `expression` is JSON Logic over the run's
  state, and whatever it evaluates to is the **label** it emits.
- An edge with `condition` is followed only when it matches that label; an
  edge without one (into `route`) is always followed.
- End the `if` with a fallback (`other`), so an unplanned value still lands on
  a branch rather than none.
- Both reply nodes write `reply`, so a finished run has one whichever ran.

CLI `naturali validate-orchestration` · SDK `naturali.orchestrations.validateOrchestration`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestrations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "nodes": [
    { "id": "triage", "type": "agent", "agent_id": "$TRIAGE",
      "input_mapping": { "message": { "var": "input.message" } },
      "state_mapping": { "category": { "var": "output.object.category" } } },
    { "id": "route", "type": "condition",
      "expression": { "if": [{ "==": [{ "var": "category" }, "refund"] }, "refund", "other"] } },
    { "id": "refund_reply", "type": "agent", "agent_id": "$REFUNDS",
      "input_mapping": { "message": { "var": "input.message" } },
      "state_mapping": { "reply": { "var": "output.content" } } },
    { "id": "general_reply", "type": "agent", "agent_id": "$GENERAL",
      "input_mapping": { "message": { "var": "input.message" } },
      "state_mapping": { "reply": { "var": "output.content" } } }
  ],
  "edges": [
    { "from": "triage", "to": "route" },
    { "from": "route", "to": "refund_reply", "condition": "refund" },
    { "from": "route", "to": "general_reply", "condition": "other" }
  ]
}
EOF
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

## 3. Declare the orchestration

`output_mapping` puts both the decision and the answer in the run's `output`,
so a caller sees which way the message went without reading the steps. Add to
`naturali.yaml`:

```yaml
resources:
  Router:
    type: orchestration
    properties:
      name: support-triage
      nodes:
        - id: triage
          type: agent
          agent_id: { ref: Triage }
          input_mapping: { message: { var: input.message } }
          state_mapping: { category: { var: output.object.category } }
        - id: route
          type: condition
          expression:
            if: [{ "==": [{ var: category }, refund] }, refund, other]
        - id: refund_reply
          type: agent
          agent_id: { ref: Refunds }
          input_mapping: { message: { var: input.message } }
          state_mapping: { reply: { var: output.content } }
        - id: general_reply
          type: agent
          agent_id: { ref: General }
          input_mapping: { message: { var: input.message } }
          state_mapping: { reply: { var: output.content } }
      edges:
        - { from: triage, to: route }
        - { from: route, to: refund_reply, condition: refund }
        - { from: route, to: general_reply, condition: other }
      output_mapping:
        category: { var: state.category }
        reply: { var: state.reply }
outputs:
  orchestration_id: { ref: Router }
```

Apply it with `naturali-deploy-a-formation`; the plan reports
`{ "logical_id": "Router", "resource_type": "orchestration", "action": "create" }`.

```bash
export ORCHESTRATION=orch_2Aaun8XhlWvrHtGH
```

- Without a formation (only when the user asks): `POST …/orchestrations` with
  `name`, `nodes`, `edges`, `output_mapping` (CLI `naturali create-orchestration`
  · SDK `naturali.orchestrations.createOrchestration`).

## 4. Run a refund request

`"wait": true` holds the request until the run settles, so the answer is the
finished run (about two seconds here).

CLI `naturali start-orchestration-run` · SDK `naturali.orchestrations.startOrchestrationRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"orchestration_id\": \"$ORCHESTRATION\",
    \"input\": { \"message\": \"The cake I picked up yesterday was dry. Can I get my money back?\" },
    \"wait\": true
  }"
```

```json
{
  "id": "orch_run_mKndShNtDd6ebowa",
  "status": "succeeded",
  "output": { "category": "refund", "reply": "Please provide a receipt. Refunds are only offered for custom cakes returned within 48 hours of pickup." },
  "node_executions": [
    { "node_id": "triage", "status": "completed", "output": { "object": { "category": "refund" }, "content": "{\"category\":\"refund\"}" } },
    { "node_id": "route", "node_type": "condition", "status": "completed", "output": { "label": "refund" } },
    { "node_id": "refund_reply", "status": "completed", "output": { "object": null, "content": "Please provide a receipt. …" } },
    { "node_id": "general_reply", "status": "skipped", "input": null, "output": null, "started_at": null }
  ]
}
```

- `general_reply` stays in the record as `skipped`, with no input, output or
  start time: it was never dispatched.
- A waited answer carries no `usage`; read the run back with
  `naturali-orchestrate-several-agents` step 5 for the cost of the steps that ran.

## 5. Run a general question

Same call, `"input": { "message": "Are you open on Sunday?" }`:

```json
{
  "id": "orch_run_p0CMMm2cKBvBMRx0",
  "status": "succeeded",
  "output": { "category": "other", "reply": "No, sorry, we are closed on Sundays. …" },
  "node_executions": [
    { "node_id": "triage", "status": "completed", "output": { "object": { "category": "other" } } },
    { "node_id": "route", "status": "completed", "output": { "label": "other" } },
    { "node_id": "general_reply", "status": "completed" },
    { "node_id": "refund_reply", "status": "skipped" }
  ]
}
```

Done when, across the two runs of one orchestration version, `route` emitted
`refund` then `other`, the matching reply node is `completed` and the other
`skipped` each time, and `output.category` and `output.reply` say which way
each message went.

- To merge branches back into one node, edges into it take
  `activation_group` and `activation_condition` (`all` or `any`).

## Related skills

- `naturali-orchestrate-several-agents` — the pipeline basics and reading a run back.
- `naturali-pause-a-run-for-a-human-decision` — put an `approval` node on one branch so only refunds wait for a person.
- `naturali-return-structured-output` — the `output_schema` the triage agent relies on.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an orchestration too.
