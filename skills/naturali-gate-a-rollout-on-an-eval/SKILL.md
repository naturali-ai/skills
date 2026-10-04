---
name: naturali-gate-a-rollout-on-an-eval
description: Declare a naturali.ai dataset and eval in a formation template and deploy it, write a new agent version through the same kind of template update, start a staged rollout with a promotion_gate that refuses to promote a new agent version until an eval run pinned to that version passes, produce that run, promote, and read the eval_run_id recorded on the version. Use when asked to require a passing eval before promoting a canary, block an agent release until tests pass, fix a PROMOTION_GATE_UNMET error, pin an eval run to an agent_version, or see which eval cleared a naturali agent version.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/gate-a-rollout-on-an-eval
---

# Gate a rollout on an eval

Outcome: a staged rollout that refuses to promote until an eval run pinned to
the new version passes — and a new version that went live with that run
recorded beside it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT`, `PROVIDER`, `AGENT` and `FORMATION` (with its `agent.yaml`) —
  the agent and the formation that declared it, from
  `naturali-first-agent-generation` (instructions *Answer in one sentence. If
  you are unsure, say so.*), at `version` 1 with no rollout running. If you did
  `naturali-roll-out-an-agent-version`, use its current version as
  `stable_version` in step 3 and step 2's version as `canary_version`.
- `jq`, to put the template file into the JSON body.
- Four model calls in all (one generation and one judge call per case, two runs).

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare the dataset, the case and the eval

The rollout will name this eval as its gate. `pass_threshold: 1` means every
case must pass; `llm_judge` needs a model of its own, here `ai_provider_id`.
Save as `refund-gate.yaml`:

```yaml
parameters:
  AgentId:
    type: string
  ProviderId:
    type: string
resources:
  Dataset:
    type: dataset
    properties:
      name: refund-policy
      description: Answers the refund policy must keep right
  RefundCase:
    type: dataset_item
    properties:
      dataset_id:
        ref: Dataset
      input:
        - role: user
          content: What is our refund window?
      expected_output: Refunds are accepted within 30 days of purchase.
  RefundGate:
    type: eval
    properties:
      name: refund-gate
      agent_id:
        param: AgentId
      dataset_id:
        ref: Dataset
      pass_threshold: 1
      scorers:
        - type: llm_judge
          prompt: >-
            Rate 0-1 how well the answer matches the reference. Answer with
            {"score": <0-1>, "reasoning": "<why>"}. Question: {{input}}
            Answer: {{output}} Reference: {{expected}}
          pass_threshold: 0.7
          ai_provider_id:
            param: ProviderId
outputs:
  dataset_id:
    ref: Dataset
  eval_id:
    ref: RefundGate
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t refund-gate.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t refund-gate.yaml --arg a "$AGENT" --arg p "$PROVIDER" \
        '{name: "refund-gate", template: $t, parameters: {AgentId: $a, ProviderId: $p}}')"
```

```json
{ "id": "form_Tz6mR1vKe8YqW3hN", "status": "active", "error": null,
  "outputs": { "dataset_id": "dset_SQlIIzyfjZ8RfnWp", "eval_id": "eval_RPMTrH6wp2eHPrC1" } }
```

```bash
export DATASET=dset_SQlIIzyfjZ8RfnWp
export EVAL=eval_RPMTrH6wp2eHPrC1
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Only when the user asks for direct calls: `POST …/datasets` (CLI
  `naturali create-dataset` · SDK `naturali.evaluations.createDataset`),
  `POST …/datasets/{dataset_id}/items` (CLI `naturali create-dataset-item` ·
  SDK `naturali.evaluations.createDatasetItem`), `POST …/evals` (CLI
  `naturali create-eval` · SDK `naturali.evaluations.createEval`), each with the
  same properties as the body.

## 2. Write the new version

Give the agent the policy in the formation that declared it. The update
archives version 2; nothing serves it yet. In `agent.yaml`:

```yaml
      instructions: "Answer in one sentence. Our refund policy: refunds are accepted within 30 days of purchase. If you are unsure, say so."
```

Plan the change (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update",
  "physical_resource_id": "agent_gCmLeRABaJYLeM2Z" }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_gCmLeRABaJYLeM2Z" } }
```

- The agent keeps its id, at `version` 2 with `active_release: null`.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` (CLI `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

## 3. Start a gated rollout

Traffic splits exactly as without a gate; `promotion_gate` only decides how the
rollout may end.

CLI `naturali set-agent-release` · SDK `naturali.agentVersions.setAgentRelease`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "stable_version": 1, "canary_version": 2, "canary_percent": 10, "promotion_gate": "'"$EVAL"'" }'
```

```json
{ "version": 2,
  "active_release": { "stable_version": 1, "canary_version": 2, "canary_percent": 10, "promotion_gate": "eval_RPMTrH6wp2eHPrC1" } }
```

- The gate must be an eval of this agent in this project; anything else is a `400`.
- The release has its own route; it is not a template property, so it stays a
  direct call (as do promote and eval runs, which are actions).

## 4. Try to promote

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

`409`:

```json
{ "error": { "code": "PROMOTION_GATE_UNMET",
  "meta": { "promotion_gate": "eval_RPMTrH6wp2eHPrC1", "agent_version": 2 } } }
```

The rollout keeps running untouched: 10% of traffic still gets version 2.

## 5. Run the eval without a version

A run naming no `agent_version` measures the release's stable version.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true }'
```

```json
{ "id": "evrun_4IKmAxJsIFNWDsba", "agent_version": 1, "status": "completed", "passed": false }
```

- Even had it passed, it could not open the gate: only a run pinned to the
  canary version counts.

## 6. Run the eval against the new version

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true, "agent_version": 2 }'
```

```json
{ "id": "evrun_T8ZROCSa4dTvZ7H4", "agent_version": 2, "status": "completed",
  "aggregate_scores": { "pass_rate": 1, "scored_item_count": 1 }, "passed": true }
```

`status: completed`, `passed: true`, `agent_version: 2` — the three things the
gate checks.

## 7. Promote

The same call as step 4.

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "version": 2, "active_release": null }
```

Version 2 now serves all traffic.

## 8. Read the evidence on the version

CLI `naturali list-agent-versions` · SDK `naturali.agentVersions.listAgentVersions`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/versions" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [
    { "version": 2, "eval_run_id": "evrun_T8ZROCSa4dTvZ7H4" },
    { "version": 1, "eval_run_id": null }
  ], "total": 2 }
```

Done when promote answers with `active_release: null` and version 2's
`eval_run_id` is the run from step 6.

## Related skills

- `naturali-score-an-agent-change` — more cases, other scorers, per-scorer deltas against a baseline.
- `naturali-deploy-a-system-from-a-template` — ship datasets and evals beside the agent they verify.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an eval, so the gate keeps being fed.
