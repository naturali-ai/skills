---
name: naturali-orchestrate-several-agents
description: Declare three naturali.ai agents (researcher, writer, reviewer) and the orchestration that chains them in one formation template, deploy it, run it and read what each step produced. Use when asked to build a multi-agent pipeline, chain agents in sequence, create or validate a naturali orchestration, map state between agent nodes, start an orchestration run, or inspect node_executions of a run.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/orchestrate-several-agents
---

# Orchestrate several agents

Outcome: a support-reply orchestration of three agents, deployed from one
formation, each doing one job in order — proven by a run that succeeded and
whose record shows the facts, the draft and the checked reply each step
produced.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, as in
  `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- Every agent node is one generation: this pipeline counts as three runs
  against the plan's monthly allowance, and a run never starts while the
  project owes for usage already served.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create the three agents

Declare the whole system in one template, `support-reply.yaml`; the provider
comes in as a parameter. An agent node receives its inputs as one user
message, one `key: value` line per input, so the instructions name the inputs
they expect. The file starts:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Researcher:
    type: agent
    properties:
      name: support-researcher
      ai_provider_id:
        param: ProviderId
      instructions: You receive a customer question and a policy. List, as short bullet points, only the policy facts that answer the question.
  Writer:
    type: agent
    properties:
      name: support-writer
      ai_provider_id:
        param: ProviderId
      instructions: You receive a customer question and a list of facts. Write a friendly reply of at most three sentences that uses only those facts.
  Reviewer:
    type: agent
    properties:
      name: support-reviewer
      ai_provider_id:
        param: ProviderId
      instructions: You receive facts and a draft reply. Return the draft, corrected so it states nothing the facts do not support. Return only the reply text, without quotes.
```

- Only when the user asks for direct calls: `POST …/agents` per agent, with the
  same properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

## 2. Describe the pipeline and validate it

`nodes` say what each step does, `edges` what follows what. In each `agent`
node, `agent_id` is a `ref` to an agent above, `input_mapping` is JSON Logic
over the run's state (`input.question` is the run's input, `facts` is what an
earlier node wrote) and `state_mapping` says where the answer goes
(`output.content` is the agent's text reply). `output_mapping` decides what a
finished run's `output` holds, so callers read `output.reply` however the steps
change later. The file continues:

```yaml
  Pipeline:
    type: orchestration
    properties:
      name: support-reply
      nodes:
        - id: research
          type: agent
          agent_id: { ref: Researcher }
          input_mapping:
            question: { var: input.question }
            policy: { var: input.policy }
          state_mapping: { facts: { var: output.content } }
        - id: draft
          type: agent
          agent_id: { ref: Writer }
          input_mapping:
            question: { var: input.question }
            facts: { var: facts }
          state_mapping: { draft: { var: output.content } }
        - id: review
          type: agent
          agent_id: { ref: Reviewer }
          input_mapping:
            facts: { var: facts }
            draft: { var: draft }
          state_mapping: { reply: { var: output.content } }
      edges:
        - { from: research, to: draft }
        - { from: draft, to: review }
      output_mapping:
        reply: { var: state.reply }
outputs:
  orchestration_id:
    ref: Pipeline
```

Validate (creates nothing):

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-reply.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

- The graph-level check (an edge to a missing node, a `var` no step writes, a
  node missing a field its type needs) is `POST …/orchestrations/validate`
  (CLI `naturali validate-orchestration` · SDK
  `naturali.orchestrations.validateOrchestration`); it takes real agent ids, so
  it belongs to a direct-call build.

## 3. Create the orchestration

Deploying creates the agents, then the orchestration at version 1.

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-reply.yaml --arg p "$PROVIDER" \
        '{name: "support-reply", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "orchestration_id": "orch_HGy16aPwsrkszumb" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- To change a step later, edit `support-reply.yaml`, `POST …/formations/plan`
  with `formation_id` (CLI `naturali plan-formation` · SDK
  `naturali.formations.planFormation`), then `PUT …/formations/{formation_id}`
  (CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`).
- Only when the user asks for direct calls: `POST …/orchestrations` with
  `name`, `nodes`, `edges`, `output_mapping` (CLI `naturali create-orchestration`
  · SDK `naturali.orchestrations.createOrchestration`).

```bash
export FORMATION=form_EPis15Nfukary167
export ORCHESTRATION=orch_HGy16aPwsrkszumb
```

## 4. Start a run

Background by default: the call answers `201` with a `queued` run at once.

CLI `naturali start-orchestration-run` · SDK `naturali.orchestrations.startOrchestrationRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"orchestration_id\": \"$ORCHESTRATION\",
    \"input\": {
      \"question\": \"Can I get a refund on a cake I picked up yesterday?\",
      \"policy\": \"Custom cakes: refunds within 48 hours of pickup, with the receipt. Bread and pastries: no refunds, same-day exchanges only. Refunds go back to the original payment method within 5 business days.\"
    }
  }"
```

```json
{ "id": "orch_run_6edpfLYy6vJtHfgH", "orchestration_version": 1, "status": "queued", "output": null }
```

- Pass `"wait": true` in the body to hold the request open until the run
  settles.

```bash
export RUN=orch_run_6edpfLYy6vJtHfgH
```

## 5. Read the run back

Poll until `status` is terminal — `succeeded`, `failed`, `cancelled` or
`expired`.

CLI `naturali get-orchestration-run` · SDK `naturali.orchestrations.getOrchestrationRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "succeeded",
  "output": { "reply": "Yes, a cake is eligible for a refund. It must be requested within 48 hours of pickup, …" },
  "node_executions": [
    { "node_id": "research", "status": "completed", "output": { "content": "*   Cakes are eligible for refunds.\n…" } },
    { "node_id": "draft", "status": "completed", "input": { "facts": "*   Cakes are eligible for refunds.\n…", "question": "…" },
      "output": { "content": "Yes, a cake is eligible for a refund, but …" } },
    { "node_id": "review", "status": "completed", "output": { "content": "Yes, a cake is eligible for a refund. …" } }
  ],
  "usage": { "cost_usd": 0.00007313, "input_tokens": 319, "output_tokens": 127 },
  "trace_id": "trace_2mWssjSFsGAd5d2D"
}
```

Done when `status` is `succeeded`, `output.reply` holds the reviewed answer,
and `node_executions` lists `research`, `draft`, `review` in order, each
`completed` — the writer's input being exactly the researcher's facts.
`usage` covers all three steps; `trace_id` opens the run in traces.

## Related skills

- `naturali-branch-an-orchestration` — a `condition` node sends each message down one path.
- `naturali-pause-a-run-for-a-human-decision` — make every reply wait for a person's approval.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an orchestration the same way.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
