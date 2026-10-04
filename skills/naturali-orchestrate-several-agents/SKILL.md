---
name: naturali-orchestrate-several-agents
description: Chain several naturali.ai agents into one orchestration (researcher, writer, reviewer), start a run and read what each step produced. Use when asked to build a multi-agent pipeline or squad, chain agents in sequence, pass one agent's output to the next, write input_mapping, state_mapping or output_mapping, validate an orchestration, start or poll a run, or read a run's node_executions.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/orchestrate-several-agents
---

# Orchestrate several agents

Outcome: a `support-reply` orchestration of three agents, each doing one job in
order, proven by a `succeeded` run whose record shows the facts, the draft and
the checked reply each step produced.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Provider` in `naturali.yaml`, from `naturali-enable-naturali-models` or
  `naturali-bring-your-own-model-key`, deployed as `$FORMATION` with
  `naturali-deploy-a-formation`.
- Every agent node is one generation: this pipeline counts as three runs
  against the plan's monthly allowance, and its managed tokens draw on the
  balance. A run never starts while the project owes for usage already served
  (`402 insufficient_credit`).

Ids below are examples; use the ones your own calls return.

## 1. Declare the three agents

Each agent does one job and reads only what the step before handed over. An
agent node receives its inputs as **one user message, one `key: value` line per
input**, so the instructions name the inputs they expect. Add to
`naturali.yaml` (agent mechanics in `naturali-create-an-agent`):

```yaml
resources:
  Researcher:
    type: agent
    properties:
      name: support-researcher
      ai_provider_id: { ref: Provider }
      instructions: You receive a customer question and a policy. List, as short bullet points, only the policy facts that answer the question.
  Writer:
    type: agent
    properties:
      name: support-writer
      ai_provider_id: { ref: Provider }
      instructions: You receive a customer question and a list of facts. Write a friendly reply of at most three sentences that uses only those facts.
  Reviewer:
    type: agent
    properties:
      name: support-reviewer
      ai_provider_id: { ref: Provider }
      instructions: You receive facts and a draft reply. Return the draft, corrected so it states nothing the facts do not support. Return only the reply text, without quotes.
outputs:
  researcher_id: { ref: Researcher }
  writer_id: { ref: Writer }
  reviewer_id: { ref: Reviewer }
```

Apply it with `naturali-deploy-a-formation` and export the ids from `outputs`:

```bash
export RESEARCHER=agent_lBSeFLo1Z4NgQlm0
export WRITER=agent_VOJ1cafUEXZnR8ut
export REVIEWER=agent_iKQR3K4ivAFcVSzC
```

- Without a formation (only when the user asks): `POST …/agents` per agent with
  the same properties (CLI `naturali create-agent` · SDK `naturali.agents.createAgent`).

## 2. Validate the pipeline

`nodes` say what each step does, `edges` what follows what. In an `agent` node:

- `input_mapping` — what the agent receives; each value is JSON Logic over the
  run's state. `input.question` is the run's input; bare `facts` is what an
  earlier node wrote.
- `state_mapping` — where the answer goes; `output.content` is the agent's text
  reply.

The formation validate only type-checks properties; this call checks the graph
itself without saving it — an edge to a missing node, a `var` no step writes, a
node missing a field its type needs.

CLI `naturali validate-orchestration` · SDK `naturali.orchestrations.validateOrchestration`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestrations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "nodes": [
    { "id": "research", "type": "agent", "agent_id": "$RESEARCHER",
      "input_mapping": { "question": { "var": "input.question" }, "policy": { "var": "input.policy" } },
      "state_mapping": { "facts": { "var": "output.content" } } },
    { "id": "draft", "type": "agent", "agent_id": "$WRITER",
      "input_mapping": { "question": { "var": "input.question" }, "facts": { "var": "facts" } },
      "state_mapping": { "draft": { "var": "output.content" } } },
    { "id": "review", "type": "agent", "agent_id": "$REVIEWER",
      "input_mapping": { "facts": { "var": "facts" }, "draft": { "var": "draft" } },
      "state_mapping": { "reply": { "var": "output.content" } } }
  ],
  "edges": [{ "from": "research", "to": "draft" }, { "from": "draft", "to": "review" }]
}
EOF
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

## 3. Declare the orchestration

The same graph, with `{ ref: … }` in place of the ids. `output_mapping` decides
what a finished run's `output` holds — here only the reviewed reply — so a
caller reads `output.reply` however the steps change later. Add to
`naturali.yaml`:

```yaml
resources:
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
  orchestration_id: { ref: Pipeline }
```

Apply it with `naturali-deploy-a-formation`; the plan reports
`{ "logical_id": "Pipeline", "resource_type": "orchestration", "action": "create" }`.
The orchestration starts at `version` 1.

```bash
export ORCHESTRATION=orch_HGy16aPwsrkszumb
```

- Without a formation (only when the user asks): `POST …/orchestrations` with
  `name`, `nodes`, `edges`, `output_mapping` (CLI `naturali create-orchestration`
  · SDK `naturali.orchestrations.createOrchestration`).
- Editing the graph later archives the previous version; a run in flight keeps
  the version it started on.

## 4. Start a run

`input` is what the first node reads. Runs are background by default: `201`
with a `queued` run at once.

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
{ "id": "orch_run_6edpfLYy6vJtHfgH", "orchestration_version": 1, "status": "queued", "active_nodes": [], "output": null }
```

```bash
export RUN=orch_run_6edpfLYy6vJtHfgH
```

- `"wait": true` in the body holds the request open until the run settles (or
  parks), but that answer carries no `usage`; read the run back for cost.

## 5. Read the run back

Poll until `status` is terminal: `succeeded`, `failed`, `cancelled` or
`expired` (this one took about three seconds).

CLI `naturali get-orchestration-run` · SDK `naturali.orchestrations.getOrchestrationRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "succeeded",
  "output": { "reply": "Yes, a cake is eligible for a refund. It must be requested within 48 hours of pickup, and a receipt is required. …" },
  "node_executions": [
    { "node_id": "research", "node_type": "agent", "status": "completed",
      "output": { "object": null, "content": "*   Cakes are eligible for refunds.\n*   Refunds must be requested within 48 hours of pickup.\n…" } },
    { "node_id": "draft", "node_type": "agent", "status": "completed",
      "input": { "facts": "*   Cakes are eligible for refunds.\n…", "question": "Can I get a refund on a cake I picked up yesterday?" },
      "output": { "object": null, "content": "Yes, a cake is eligible for a refund, but …" } },
    { "node_id": "review", "node_type": "agent", "status": "completed",
      "output": { "object": null, "content": "Yes, a cake is eligible for a refund. …" } }
  ],
  "usage": { "cost_usd": 0.00007313, "input_tokens": 319, "output_tokens": 127 },
  "trace_id": "trace_2mWssjSFsGAd5d2D"
}
```

Done when `status` is `succeeded`, `output.reply` holds the reviewed answer, and
`node_executions` lists `research`, `draft`, `review` in order, each
`completed`, the writer's `input.facts` being exactly the researcher's output.
`usage` is the cost of all three steps; `trace_id` opens the run in traces.

## Related skills

- `naturali-branch-an-orchestration` — a `condition` node sends each message down one path.
- `naturali-pause-a-run-for-a-human-decision` — make every reply wait for a person's approval.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an orchestration (`target_type: orchestration`) the same way.
- `naturali-model-a-process-as-a-workflow` — a workflow state can dispatch this orchestration.
- `naturali-read-a-run` — the generations and trace behind each agent step.
