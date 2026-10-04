---
name: naturali-score-an-agent-change
description: Measure whether a naturali.ai agent change is good enough to ship with an eval (dataset, llm_judge scorer, pass threshold) run before and after, compared per scorer. Use when asked to test or regression-test an agent, check a prompt change before shipping, compare two eval runs or agent versions, get a pass/fail verdict, read why items failed, or when creating an eval answers 400 VALIDATION_FAILED or a run reports pass_rate null.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/score-an-agent-change
---

# Score an agent change

Outcome: a repeatable verdict on "is this change good enough to ship?" —
`passed` against your threshold, per-item scores saying which cases failed and
why, and a per-scorer delta against the previous run.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` and `Provider` in `naturali.yaml` (`naturali-create-an-agent`). The
  provider must really work: each run makes one real generation per case, so a
  wrong credential produces errored items, not scores.
- `Cases` in `naturali.yaml` with reference answers, from
  `naturali-build-an-eval-dataset`.
- Each run generates once per case and `llm_judge` adds one model call per case.

Ids below are examples; use the ones your own calls return.

## 1. Declare the eval

An eval binds the agent under test to the dataset and **freezes** the scorers,
so two runs are judged by identical criteria and their difference measures the
agent. `llm_judge` grades each answer against `expected_output` with a model
and returns a score with its reasoning — the right first scorer when the right
answer can be worded many ways. Add to `naturali.yaml`:

```yaml
resources:
  Suite:
    type: eval
    properties:
      name: billing-regression-suite
      agent_id: { ref: Agent }
      dataset_id: { ref: Cases }
      pass_threshold: 0.8
      scorers:
        - type: llm_judge
          ai_provider_id: { ref: Provider }
          pass_threshold: 0.7
          prompt: >-
            Rate 0-1 how well the answer matches the reference. Answer with
            {"score": <0-1>, "reasoning": "<why>"}. Question: {{input}}
            Answer: {{output}} Reference: {{expected}}
outputs:
  eval_id: { ref: Suite }
```

Apply it with `naturali-deploy-a-formation`, then:

```bash
export EVAL=eval_TFAwXeInG0W1rwFd
```

- The eval's `pass_threshold` is the gate: a run passes when its pass rate
  (items passing every scorer over non-errored items) reaches it. Omit it for
  scores without a `passed` verdict.
- `llm_judge` needs its own `pass_threshold` (a continuous score says nothing
  about "good enough") and a model: `ai_provider_id` on the scorer or a default
  model route on the project — with neither, `400 VALIDATION_FAILED`. Pin
  `model` too when comparing over time: runs judged by different models are not
  comparable.
- Other scorers: `exact_match`, `contains` (`value`), `json_logic`
  (`expression`), `output_schema` (needs an agent `output_schema`),
  `embedding_similarity` (`pass_threshold`), `tool` (your own scoring tool,
  `http`/`mcp`/`pipeline`). Each type at most once per eval; `tool` may repeat
  under distinct `name`s.
- Changing scorers later is an edit of `Suite` plus an update.
- Without a formation (only when the user asks): `POST …/evals` with the same
  properties (CLI `naturali create-eval` · SDK `naturali.evaluations.createEval`).

## 2. Run it and read the verdict

`wait: true` runs synchronously and returns the finished run.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true }'
```

```json
{
  "id": "evrun_Hgr3ZTN8pd5jMOrV",
  "agent_version": 1,
  "status": "completed",
  "baseline_run_id": null,
  "aggregate_scores": {
    "scorers": { "llm_judge": { "mean": 0, "pass_rate": 0 } },
    "pass_rate": 0,
    "scored_item_count": 2,
    "pass_rate_interval": { "low": 0, "high": 0.66, "level": 0.95 }
  },
  "passed": false,
  "item_count": 2,
  "completed_count": 2,
  "errored_count": 0
}
```

```bash
export RUN=evrun_Hgr3ZTN8pd5jMOrV
```

- `passed: false`: the agent does not know the policy. `pass_rate_interval` is
  the 95% interval around the rate — wide means the suite is still small.
- The run is pinned to one `agent_version` (here the live one), so a rollout in
  progress cannot blend two configs into one score. Pass `agent_version` to
  score a specific version (`naturali-gate-a-rollout-on-an-eval`).
- Errored items are excluded, not scored 0. All errored → `pass_rate: null`,
  `scored_item_count: 0`, `passed: false`: check the provider credential before
  reading anything into it.
- Over 25 cases, `wait: true` is a `400`; run in the background and poll
  (`naturali-score-open-ended-answers`).
- `402 insufficient_credit` while the billing owner owes; a Free account past
  its monthly runs gets `403 plan_limit_reached` (`resource: "runs"`).
- Optional body: `metadata` (your attribution, e.g. a commit sha, returned
  verbatim).

## 3. Change the agent and compare

Make the change — here, give `Agent` the policy it was missing in
`naturali.yaml` — and apply it with `naturali-deploy-a-formation`:

```yaml
resources:
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id: { ref: Provider }
      instructions: Answer in one sentence. Invoices are issued on the first of each month. Refunds are accepted within 30 days of purchase. If you are unsure, say so.   # changed
```

The plan reads `update` for `Agent`; it keeps its id and moves to version 2.
Rerun the same eval, naming the first run as baseline:

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true, "baseline_run_id": "'"$RUN"'" }'
```

```json
{
  "id": "evrun_0pldGKUU7tIQgST0",
  "agent_version": 2,
  "baseline_run_id": "evrun_Hgr3ZTN8pd5jMOrV",
  "aggregate_scores": {
    "scorers": { "llm_judge": { "mean": 0.9, "pass_rate": 1 } },
    "pass_rate": 1,
    "baseline": {
      "run_id": "evrun_Hgr3ZTN8pd5jMOrV",
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

- `passed: true` says version 2 clears the gate; `pass_rate_delta` says the
  change moved it, over `compared_item_count` — the items scorable in both runs.
  `flipped.improved` went from failing to passing.
- `added_item_count`/`removed_item_count` show whether the dataset shifted
  between runs; a delta over a shifted dataset is not a clean comparison.
- `baseline_run_id` must be a terminal run of the same eval (`400` otherwise).

## 4. Read which items failed and why

CLI `naturali list-eval-results` · SDK `naturali.evaluations.listEvalResults`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN/results" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    {
      "dataset_item_id": "dsit_LuzYOsC1fUpPMqDp",
      "input": [{ "role": "user", "content": "When is my invoice issued?" }],
      "expected_output": "Invoices are issued on the first of each month.",
      "generation_id": "gen_rTi1Ge9bz0AVtF5C",
      "output": "I am an AI and do not know your account details, so I cannot determine when your specific invoice was or will be issued.",
      "scores": [
        { "scorer": "llm_judge", "score": 0, "passed": false, "reasoning": "The answer refuses to answer, whereas the reference gives a specific policy (the first of each month)." }
      ],
      "passed": false,
      "error": null
    }
  ],
  "total": 2
}
```

- Each result carries the frozen `input`, the agent's `output`, one score per
  scorer with the judge's `reasoning`, and the `generation_id` behind it —
  open it with `naturali-read-a-run`.
- `passed` on a result is the AND of its scorers; `error` set means the item
  was excluded from the aggregates.

Done when the rerun reports `passed: true` with
`aggregate_scores.baseline.pass_rate_delta` above 0.

## Related skills

- `naturali-build-an-eval-dataset` — the cases, including ones curated from real traffic.
- `naturali-score-open-ended-answers` — rubric judging, background runs, polling, cancel.
- `naturali-gate-a-rollout-on-an-eval` — make a rollout refuse to promote until this eval passes on the canary.
- `naturali-roll-out-an-agent-version` — ship the passing version to a share of traffic first.
- `naturali-run-an-agent-on-a-schedule` — a schedule trigger can run the suite nightly.
