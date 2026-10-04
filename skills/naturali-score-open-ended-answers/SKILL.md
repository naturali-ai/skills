---
name: naturali-score-open-ended-answers
description: Declare a naturali.ai agent, dataset and eval with an llm_judge rubric scorer in a formation template and deploy it to grade replies that have no single right wording, run the eval in the background, poll it to a verdict and read the judge's score and reasoning per item. Use when asked to evaluate free-text or support replies, write a rubric or LLM-as-judge scorer, score answers without an expected output, run a naturali eval asynchronously and poll it, read why the judge failed an item, or cancel a running eval.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/score-open-ended-answers
---

# Score open-ended answers

Outcome: a suite that grades replies with no single correct wording — a model
judges each reply against your rubric, the run executes in the background, and
every item carries the judge's score and reasoning.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key (or a session JWT).
- `jq`, to put the template file into the JSON body.
- `PROJECT` and `PROVIDER` — a project with a working provider, from
  `naturali-first-agent-generation`.
- Datasets, gates and baselines are covered in `naturali-score-an-agent-change`;
  this builds only what a rubric judge needs.
- Each item generates once and the judge makes one more call: four model calls
  per run here. Each item counts as a run on your plan.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare the agent, the cases and the rubric eval

One template declares the agent under test (a reply drafter with a rule no
string matcher could check: never promise a refund), a dataset, two cases and
the eval. A case is only the customer's message — no `expected_output`; the
rubric is the standard. `json_logic` is a cheap structural floor (reply not
empty). `llm_judge` is the rubric: the platform fills `{{input}}` and
`{{output}}` per item (`{{expected}}` too when an item has one), and the judge
must answer with a JSON object carrying a `score` from 0 to 1 and a
`reasoning`. Save as `replies.yaml`:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Drafter:
    type: agent
    properties:
      name: reply-drafter
      ai_provider_id:
        param: ProviderId
      instructions: Draft a short, warm reply to the customer message. Two sentences at most. Never promise a refund or a date you cannot confirm.
  Dataset:
    type: dataset
    properties:
      name: reply-drafts
      description: Customer messages with no single right reply
  DamagedCase:
    type: dataset_item
    properties:
      dataset_id:
        ref: Dataset
      input:
        - role: user
          content: My package arrived damaged. What now?
  ChargedTwiceCase:
    type: dataset_item
    properties:
      dataset_id:
        ref: Dataset
      input:
        - role: user
          content: I was charged twice this month.
  ReplyQuality:
    type: eval
    properties:
      name: reply-quality
      agent_id:
        ref: Drafter
      dataset_id:
        ref: Dataset
      pass_threshold: 0.5
      scorers:
        - type: json_logic
          expression: { "!=": [{ "var": "output" }, ""] }
        - type: llm_judge
          ai_provider_id:
            param: ProviderId
          pass_threshold: 0.7
          prompt: >-
            You grade customer support replies. A good reply is warm,
            acknowledges the problem, gives a concrete next step, and promises
            no refund or date. Reply with only JSON: {"score": <number 0-1>,
            "reasoning": "<one sentence>"}. Customer message: {{input}}
            Reply: {{output}}
outputs:
  agent_id:
    ref: Drafter
  dataset_id:
    ref: Dataset
  eval_id:
    ref: ReplyQuality
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t replies.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t replies.yaml --arg p "$PROVIDER" \
        '{name: "reply-quality", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_Hw4nP7cXq2LsT9eB", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_VQXRQnQ2xNHRkl2k", "dataset_id": "dset_Z8l5Z7sRUZV06xol",
               "eval_id": "eval_JuLSU7rcq2PN4fo6" } }
```

```bash
export FORMATION=form_Hw4nP7cXq2LsT9eB
export AGENT=agent_VQXRQnQ2xNHRkl2k
export DATASET=dset_Z8l5Z7sRUZV06xol
export EVAL=eval_JuLSU7rcq2PN4fo6
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Two thresholds: the scorer's `pass_threshold` (0.7, required) decides one
  reply; the eval's (0.5) gates the run on the share of items that passed every
  scorer.
- The judge needs `ai_provider_id` or the project's default model route — with
  neither, `400 VALIDATION_FAILED`. Pin `model` on the scorer when comparing
  runs over time.
- A judge reply that is not that JSON object marks the item errored, never a
  score of 0.
- To change the rubric or the agent later, edit `replies.yaml`,
  `POST …/formations/plan` with `formation_id`, then
  `PUT …/formations/{formation_id}`; both take `parameters: {ProviderId: …}`
  again.
- Only when the user asks for direct calls: `POST …/agents` (CLI
  `naturali create-agent` · SDK `naturali.agents.createAgent`),
  `POST …/datasets` (CLI `naturali create-dataset` · SDK
  `naturali.evaluations.createDataset`), `POST …/datasets/{dataset_id}/items`
  once per case (CLI `naturali create-dataset-item` · SDK
  `naturali.evaluations.createDatasetItem`), `POST …/evals` (CLI
  `naturali create-eval` · SDK `naturali.evaluations.createEval`), each with the
  same properties as the body.

## 2. Start the run in the background

`"wait": false` (the default) queues one task per item and returns at once.
`wait: true` returns the finished run and is capped at 25 items.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": false }'
```

```json
{ "id": "evrun_ftyqP9vG4MKu6OMX", "status": "queued", "aggregate_scores": null, "passed": null, "item_count": 2 }
```

```bash
export RUN=evrun_ftyqP9vG4MKu6OMX
```

## 3. Poll it to a verdict

Read until `status` is terminal — `completed`, `failed` or `canceled`.

CLI `naturali get-eval-run` · SDK `naturali.evaluations.getEvalRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "aggregate_scores": {
    "scorers": {
      "llm_judge": { "mean": 0.5, "pass_rate": 0.5 },
      "json_logic": { "mean": 1, "pass_rate": 1 }
    },
    "pass_rate": 0.5,
    "scored_item_count": 2
  },
  "passed": true,
  "errored_count": 0
}
```

One of two replies passed the judge; 0.5 meets the 0.5 gate.

## 4. Read the judge's reasoning

CLI `naturali list-eval-results` · SDK `naturali.evaluations.listEvalResults`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN/results" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{
    "generation_id": "gen_S6D9udTeRJNCEtly",
    "output": "I am so sorry to hear your package arrived damaged. Please contact our support team here to arrange a replacement or a refund.",
    "scores": [
      { "score": 1, "passed": true, "scorer": "json_logic" },
      { "score": 0.2, "passed": false, "scorer": "llm_judge",
        "reasoning": "The reply is polite but fails to provide a concrete next step or a specific timeframe, and it incorrectly offers a refund." }
    ],
    "passed": false,
    "error": null
  }],
  "total": 2
}
```

To stop a queued run spending budget, cancel it; outstanding items are dropped
and it settles `canceled`:

CLI `naturali cancel-eval-run` · SDK `naturali.evaluations.cancelEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN/cancel" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- Results already written are kept; `aggregate_scores` stays `null`.
- A finished run answers `400 VALIDATION_FAILED`; a two-item suite finishes in
  about a second, so cancel right after starting.

Done when the run is `completed` and each result carries an `llm_judge` score
with its `reasoning` — here the refund-promising reply scored 0.2.

## Related skills

- `naturali-score-an-agent-change` — pass `baseline_run_id` for a per-scorer delta against the previous run.
- `naturali-roll-out-an-agent-version` — ship the fixed instructions to a share of traffic first.
