---
name: naturali-first-agent-generation
description: Declare an agent on an existing naturali.ai AI provider in a formation template, deploy it, run one generation, poll it to completion and read the transcript back. Use when asked to create a naturali agent, run or test an agent, call the generate route, or read what an agent did in a run.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/first-agent-generation
---

# Your first agent generation

Outcome: an agent that answers — deployed from a formation, run once, and read back step by step.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, from
  `naturali-enable-naturali-models` (managed models) or
  `naturali-create-a-provider` (bring your own key).
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare and deploy the agent

Build the system as a formation: one template declares every resource, one call
deploys it, and later changes are a plan and an update of the same template.
Only the model source (`ai_provider_id`, or `model_route_id`) is required on the
agent. Save as `agent.yaml`:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: Answer in one sentence. If you are unsure, say so.
outputs:
  agent_id:
    ref: Agent
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{name: "refund-explainer", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_wq7H4Ka1eDFVsBXM" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The agent starts at `version` 1 with `model: null`, so it runs on the
  provider's `default_model`. Every config-changing update archives a new
  version, which is what staged rollouts build on.
- To change the agent later, edit `agent.yaml`, `POST …/formations/plan` with
  `formation_id` to review the diff, then `PUT …/formations/{formation_id}`;
  both take `parameters: {ProviderId: …}` again, since it has no default.
- Only when the user asks for direct calls: `POST …/agents` with the same
  properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

```bash
export FORMATION=form_EPis15Nfukary167
export AGENT=agent_wq7H4Ka1eDFVsBXM
```

## 2. Run a generation

Generation is background by default: the call answers `202` with ids and the
work continues.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What is our refund window?" }] }'
```

```json
{ "status": "accepted", "generation_id": "gen_GvfSi82dWIHZ2QuJ", "trace_id": "trace_YWhw2oowz6wCVN7N" }
```

```bash
export GENERATION=gen_GvfSi82dWIHZ2QuJ
```

Poll until `status` leaves `in_progress`:

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "status": "completed", "stop_reason": "stop", "error": null, "agent_version": 1,
  "usage": { "cost_usd": 0.00000738, "input_tokens": 19, "output_tokens": 26 } }
```

- `failed` carries a structured `error` with a `message`; the usual causes are
  a credential the vendor rejected or a model the credential cannot reach.
- To skip polling, add `?wait=true` (CLI `--wait true`, SDK
  `query: { wait: true }`): the request stays open and returns the finished
  result. Right for scripts, wrong for a request that must answer fast.

## 3. Read the run back

The transcript is the run as steps: the input, each model step with its tool
calls and results, and the output.

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "step_count": 1,
  "steps": [{ "index": 0, "text": "I am unsure of our refund window; …", "finish_reason": "stop", "tool_calls": [], "tool_results": [] }],
  "output": { "content": "I am unsure of our refund window; …", "finish_reason": "stop" }
}
```

Done when the generation is `completed` and `output.content` holds the answer.
One step with no tool calls is a plain question; a bound tool adds a step per
call, with the arguments the model chose and what came back.

## Related skills

- `naturali-answer-from-your-documents` — ground the agent in your documents.
- `naturali-structured-output` — return a typed object instead of prose.
- `naturali-run-tools-in-your-own-code` — bind a tool your code executes.
- `naturali-keep-no-conversation-content` — the same run with no content stored.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
