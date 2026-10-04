---
name: naturali-branch-an-orchestration
description: Declare a naturali.ai orchestration that chooses its own path in a formation template and deploy it - a triage agent with an output_schema classifies each message and a condition node sends it down only the matching branch - proven by two runs that took different branches. Use when asked to branch or route an orchestration, add a condition node or conditional edges, classify messages and send them to different agents, build a triage or router pipeline, or check which branch a run took.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/branch-an-orchestration
---

# Branch an orchestration

Outcome: an orchestration, deployed from a formation, that decides its own
path — a triage agent classifies each customer message and a `condition` node
sends it to the refunds agent or the general agent, never both — proven by two
runs whose records show the branch that ran as `completed` and the other as
`skipped`.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, as in
  `naturali-first-agent-generation`.
- How `nodes`, `edges`, `input_mapping` and `state_mapping` fit together, from
  `naturali-orchestrate-several-agents`.
- `jq`, to put the template file into the JSON body.
- Only the branch taken is a run: each run here counts as two runs (triage and
  one reply). A skipped node generates nothing and costs nothing.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create the three agents

Declare the whole system in one template, `support-triage.yaml`; the provider
comes in as a parameter. The triage agent's `output_schema` limits it to
`refund` or `other`, so the branch reads a field, not a sentence. The file
starts:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Triage:
    type: agent
    properties:
      name: support-triage
      ai_provider_id:
        param: ProviderId
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
      ai_provider_id:
        param: ProviderId
      instructions: "You answer refund requests for a bakery. Refunds: custom cakes within 48 hours of pickup with the receipt; bread and pastries are exchange only, same day. Reply in at most two sentences."
  General:
    type: agent
    properties:
      name: support-general
      ai_provider_id:
        param: ProviderId
      instructions: You answer general questions for a bakery open 7am to 6pm, Monday to Saturday. Reply in at most two sentences.
```

- Only when the user asks for direct calls: `POST …/agents` per agent, with the
  same properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

## 2. Describe the branching graph and validate it

- `triage` writes `category`: with a schema, the parsed answer is
  `output.object`, so the field is `output.object.category`.
- `route` is a `condition` node: its JSON Logic `expression` evaluates to the
  **label** it emits (`refund` or `other`).
- Both reply nodes write `reply`, so every finished run has one.
- An edge with a `condition` is followed only when it matches the emitted
  label; the edge into `route` has none, so it is always followed. The `if`
  falls back to `other`, so an unplanned value still lands on a branch.
- `output_mapping` puts both the decision and the answer in a finished run's
  `output`.

The file continues:

```yaml
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
  orchestration_id:
    ref: Router
```

Validate (creates nothing):

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-triage.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

- The graph-level check is `POST …/orchestrations/validate` (CLI
  `naturali validate-orchestration` · SDK
  `naturali.orchestrations.validateOrchestration`); it takes real agent ids, so
  it belongs to a direct-call build.

## 3. Create the orchestration

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-triage.yaml --arg p "$PROVIDER" \
        '{name: "support-triage", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "orchestration_id": "orch_2Aaun8XhlWvrHtGH" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Only when the user asks for direct calls: `POST …/orchestrations` with
  `name`, `nodes`, `edges`, `output_mapping` (CLI `naturali create-orchestration`
  · SDK `naturali.orchestrations.createOrchestration`).

```bash
export FORMATION=form_EPis15Nfukary167
export ORCHESTRATION=orch_2Aaun8XhlWvrHtGH
```

## 4. Run a refund request

`"wait": true` holds the request open until the run settles.

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
  "output": { "category": "refund", "reply": "Please provide a receipt. Refunds are only offered for custom cakes …" },
  "node_executions": [
    { "node_id": "triage", "status": "completed", "output": { "object": { "category": "refund" } } },
    { "node_id": "route", "node_type": "condition", "status": "completed", "output": { "label": "refund" } },
    { "node_id": "refund_reply", "status": "completed" },
    { "node_id": "general_reply", "status": "skipped", "input": null, "output": null, "started_at": null }
  ]
}
```

- `general_reply` stays in the record as `skipped`: it was never dispatched.
- A waited start carries no `usage`; read the run back
  with `GET /v1/projects/{project_id}/orchestration-runs/{orchestration_run_id}`
  for the cost of the steps that ran.

## 5. Run a general question

CLI `naturali start-orchestration-run` · SDK `naturali.orchestrations.startOrchestrationRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"orchestration_id\": \"$ORCHESTRATION\",
    \"input\": { \"message\": \"Are you open on Sunday?\" },
    \"wait\": true
  }"
```

```json
{
  "id": "orch_run_p0CMMm2cKBvBMRx0",
  "status": "succeeded",
  "output": { "category": "other", "reply": "No, sorry, we are closed on Sundays. …" },
  "node_executions": [
    { "node_id": "triage", "status": "completed", "output": { "object": { "category": "other" } } },
    { "node_id": "route", "status": "completed", "output": { "label": "other" } },
    { "node_id": "general_reply", "status": "completed" },
    { "node_id": "refund_reply", "status": "skipped", "input": null, "output": null, "started_at": null }
  ]
}
```

Done when, across the two runs of one orchestration version, `route` emitted
`refund` then `other`, the matching reply node is `completed` and the other
`skipped` in each, and `output.category` and `output.reply` show which way each
message went.

## Related skills

- `naturali-pause-a-run-for-a-human-decision` — put an `approval` node on one branch so only refunds wait for a human.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an orchestration the same way.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
