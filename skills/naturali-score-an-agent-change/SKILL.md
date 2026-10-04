---
name: naturali-score-an-agent-change
description: Declare a naturali.ai eval suite — a dataset, a test case and an eval with an llm_judge scorer and pass threshold — in a formation template and deploy it, curate a case from a real generation, run it for a passed verdict, then change the agent and rerun against a baseline for a per-scorer delta. Use when asked to test or regression-test a naturali agent, create a dataset or eval, turn a bad production answer into a test case, check whether an agent change is good enough to ship, compare two eval runs, or read why eval items failed.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/score-an-agent-change
---

# Score an agent change

Outcome: a repeatable suite that answers "is this change good enough to ship?" —
a `passed` verdict against your threshold, per-item scores saying which cases
failed and why, and a per-scorer delta against the previous run.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key (or a session JWT), and
  `NATURALI_API=https://api.naturali.ai/v1` for the curl calls.
- `PROJECT`, `PROVIDER`, `AGENT`, `GENERATION` and `FORMATION` (with its
  `agent.yaml`) — a working agent, the generation it ran and the formation that
  declared it, from `naturali-first-agent-generation`. Its instructions are
  *Answer in one sentence. If you are unsure, say so.*
- `jq`, to put the template file into the JSON body.
- The provider must really work: each run makes one real generation per item,
  and `llm_judge` adds one model call per item (eight calls in all here).

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare the dataset, a test case and the eval

One template declares all three. A dataset is not agent-specific and survives
every agent change. A case is the `input` messages to replay and, optionally,
the `expected_output` scorers compare against; `metadata` is yours, readable by
the `json_logic` and `tool` scorers. The eval freezes its scorers, so two runs
are judged by identical criteria; its `pass_threshold` is the gate (passed items
over non-errored items). Save as `suite.yaml`:

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
      name: billing-regressions
      description: Questions the billing agent must get right
  InvoiceCase:
    type: dataset_item
    properties:
      dataset_id:
        ref: Dataset
      input:
        - role: user
          content: When is my invoice issued?
      expected_output: Invoices are issued on the first of each month.
      metadata:
        topic: billing
  Suite:
    type: eval
    properties:
      name: billing-regression-suite
      agent_id:
        param: AgentId
      dataset_id:
        ref: Dataset
      pass_threshold: 0.8
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
    ref: Suite
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t suite.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t suite.yaml --arg a "$AGENT" --arg p "$PROVIDER" \
        '{name: "billing-regression-suite", template: $t, parameters: {AgentId: $a, ProviderId: $p}}')"
```

```json
{ "id": "form_Kq3VtS8wYbN2cR5d", "status": "active", "error": null,
  "outputs": { "dataset_id": "dset_270ATibup5AdwKwQ", "eval_id": "eval_TFAwXeInG0W1rwFd" } }
```

```bash
export SUITE=form_Kq3VtS8wYbN2cR5d
export DATASET=dset_270ATibup5AdwKwQ
export EVAL=eval_TFAwXeInG0W1rwFd
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- `llm_judge` requires its own `pass_threshold`, and a model: `ai_provider_id`
  on the scorer or a default model route on the project — with neither,
  `400 VALIDATION_FAILED`. Pin `model` too when comparing runs over time.
- Other scorer types: `exact_match`, `contains`, `output_schema`,
  `json_logic`, `embedding_similarity`, `tool`.
- Only when the user asks for direct calls: `POST …/datasets` (CLI
  `naturali create-dataset` · SDK `naturali.evaluations.createDataset`),
  `POST …/datasets/{dataset_id}/items` (CLI `naturali create-dataset-item` ·
  SDK `naturali.evaluations.createDatasetItem`), `POST …/evals` (CLI
  `naturali create-eval` · SDK `naturali.evaluations.createEval`), each with the
  same properties as the body.

## 2. Curate a case from real traffic

Promote a completed generation: its input becomes `input`, and its own answer
becomes `expected_output` unless you supply one. This copies a generation, so
it stays a direct call — and an item curated through the API is never touched
by a formation apply.

CLI `naturali create-dataset-item-from-generation` · SDK `naturali.evaluations.createDatasetItemFromGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/datasets/$DATASET/items/from-generation" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "generation_id": "'"$GENERATION"'",
        "expected_output": "Refunds are accepted within 30 days of purchase."
      }'
```

```json
{
  "id": "dsit_fD6cAKjaxvBTmEgN",
  "input": [{ "role": "user", "content": "What is our refund window?" }],
  "expected_output": "Refunds are accepted within 30 days of purchase.",
  "source_generation_id": "gen_7EZdyuFLY96IOQAN"
}
```

- The item is a copy, not a view: it survives a content purge, and
  `source_generation_id` goes null if the generation is deleted.
- Only a completed generation with stored content can be promoted. Still
  running, failed, or `trace_content_mode: none` → `409`.

## 3. Run it and read the verdict

`wait: true` runs synchronously and returns the finished run.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "wait": true }'
```

```json
{
  "id": "evrun_Hgr3ZTN8pd5jMOrV",
  "agent_version": 1,
  "status": "completed",
  "aggregate_scores": {
    "scorers": { "llm_judge": { "mean": 0, "pass_rate": 0 } },
    "pass_rate": 0,
    "scored_item_count": 2,
    "pass_rate_interval": { "low": 0, "high": 0.66, "level": 0.95 }
  },
  "passed": false,
  "errored_count": 0
}
```

```bash
export RUN=evrun_Hgr3ZTN8pd5jMOrV
```

- `passed: false`: the agent does not know the policy. A wide
  `pass_rate_interval` means the suite is still small. The run is pinned to one
  `agent_version`.
- Errored items are excluded, not scored zero. All errored → `pass_rate: null`,
  `scored_item_count: 0`, `passed: false`; check the provider credential.
- Over 25 items, drop `wait` (background is the default): it returns
  `status: "queued"`; poll `GET .../evals/{eval_id}/runs/{eval_run_id}` until
  terminal. A synchronous run over the cap is a `400`.

## 4. Change the agent and compare

Fix the agent in the formation that declared it. In `agent.yaml`:

```yaml
      instructions: Answer in one sentence. Invoices are issued on the first of each month. Refunds are accepted within 30 days of purchase. If you are unsure, say so.
```

Plan the change (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update",
  "physical_resource_id": "agent_INlEpDkbQAb419CA" }] }
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
  "outputs": { "agent_id": "agent_INlEpDkbQAb419CA" } }
```

- The agent keeps its id and moves to version 2.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` (CLI `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

Rerun the same eval with the first run as baseline.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "wait": true, "baseline_run_id": "'"$RUN"'" }'
```

```json
{
  "agent_version": 2,
  "baseline_run_id": "evrun_Hgr3ZTN8pd5jMOrV",
  "aggregate_scores": {
    "pass_rate": 1,
    "baseline": {
      "flipped": { "improved": 2, "regressed": 0 },
      "p_value": 0.5,
      "scorers": { "llm_judge": { "mean_delta": 0.9, "pass_rate_delta": 1 } },
      "pass_rate_delta": 1,
      "compared_item_count": 2,
      "added_item_count": 0,
      "removed_item_count": 0
    }
  },
  "passed": true
}
```

- The delta is over `compared_item_count` (items scorable in both runs);
  added/removed counts show whether the dataset shifted between runs.

Read per-item results to see which failed and why.

CLI `naturali list-eval-results` · SDK `naturali.evaluations.listEvalResults`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/evals/$EVAL/runs/$RUN/results" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{
    "dataset_item_id": "dsit_LuzYOsC1fUpPMqDp",
    "generation_id": "gen_rTi1Ge9bz0AVtF5C",
    "output": "I am an AI and do not know your account details, …",
    "scores": [{ "scorer": "llm_judge", "score": 0, "passed": false, "reasoning": "The answer is completely unhelpful …" }],
    "passed": false,
    "error": null
  }],
  "total": 2
}
```

Done when the second run reports `passed: true` with
`aggregate_scores.baseline.pass_rate_delta` above 0, and each failing result
names its `generation_id` and the judge's `reasoning`.

## Related skills

- `naturali-roll-out-an-agent-version` — score a canary version (pass `agent_version` on the run) before promoting.
- `naturali-gate-a-rollout-on-an-eval` — make a rollout refuse to promote until this eval passes.
- `naturali-score-open-ended-answers` — grade replies with a rubric judge, run in the background.
