---
name: naturali-score-open-ended-answers
description: Grade naturali.ai agent replies that have no single correct wording with a rubric judge - declare an eval with an llm_judge rubric prompt plus a cheap json_logic floor, start the run in the background, poll it to a verdict, read the judge's score and reasoning per item, and cancel a run you no longer need. Use when asked to write a rubric or LLM-as-judge, score free-text, support or open-ended answers, check a rule a string match cannot (tone, no promises), run an eval in the background or over 25 items, poll an eval run, read judge reasoning, cancel an eval run, or when items come back errored from an unparseable judge reply.
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

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` and `Provider` in `naturali.yaml` (`naturali-create-an-agent`). The
  example agent drafts support replies: _Draft a short, warm reply to the
  customer message. Two sentences at most. Never promise a refund or a date you
  cannot confirm._
- `Replies`, a dataset of customer messages with no `expected_output`, from
  `naturali-build-an-eval-dataset`.
- Each item generates once and the judge grades it once; each item counts as a
  run on your plan.

Ids below are examples; use the ones your own calls return.

## 1. Declare the eval with a rubric

`exact_match` and `contains` need a known string; a support reply has many good
forms. Two scorers: `json_logic` is a cheap structural floor (the reply is not
empty); `llm_judge` is the rubric. The platform fills `{{input}}` and
`{{output}}` per item (`{{expected}}` too when an item has one); the judge must
answer a JSON object with a `score` from 0 to 1 and a `reasoning`. Add to
`naturali.yaml`:

```yaml
resources:
  ReplyQuality:
    type: eval
    properties:
      name: reply-quality
      agent_id: { ref: Agent }
      dataset_id: { ref: Replies }
      pass_threshold: 0.5
      scorers:
        - type: json_logic
          expression: { "!=": [{ "var": "output" }, ""] }
        - type: llm_judge
          ai_provider_id: { ref: Provider }
          pass_threshold: 0.7
          prompt: >-
            You grade customer support replies. A good reply is warm,
            acknowledges the problem, gives a concrete next step, and promises
            no refund or date. Reply with only JSON: {"score": <number 0-1>,
            "reasoning": "<one sentence>"}. Customer message: {{input}}
            Reply: {{output}}
outputs:
  reply_quality_eval_id: { ref: ReplyQuality }
```

Apply it with `naturali-deploy-a-formation`, then:

```bash
export EVAL=eval_JuLSU7rcq2PN4fo6
```

- Two thresholds, two jobs: the scorer's `pass_threshold` (0.7, required)
  decides whether one reply passes the judge; the eval's (0.5) gates the run on
  the share of items that passed every scorer.
- The judge runs on the scorer's `ai_provider_id` or the project's default
  model route — with neither, `400 VALIDATION_FAILED`. Pin `model` on the scorer
  when comparing runs over time.
- A judge reply that is not that JSON object marks the **item** errored, never a
  score of 0, so an unparseable verdict cannot pass as a regression.
- Without a formation (only when the user asks): `POST …/evals` with the same
  properties (CLI `naturali create-eval` · SDK `naturali.evaluations.createEval`).

## 2. Start the run in the background

A judged suite makes two model calls per item. `wait: false` (the default)
queues one task per item and returns at once, with no item cap.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": false }'
```

```json
{
  "id": "evrun_ftyqP9vG4MKu6OMX",
  "eval_id": "eval_JuLSU7rcq2PN4fo6",
  "agent_version": 1,
  "status": "queued",
  "aggregate_scores": null,
  "passed": null,
  "item_count": 2,
  "completed_count": 0,
  "errored_count": 0
}
```

```bash
export RUN=evrun_ftyqP9vG4MKu6OMX
```

- `wait: true` returns the finished run but is capped at 25 items (`400` over
  it, nothing scored). Both modes score items the same way, so results compare.

## 3. Poll it to a verdict

Read the run until `status` is terminal: `completed`, `failed` or `canceled`.

CLI `naturali get-eval-run` · SDK `naturali.evaluations.getEvalRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "evrun_ftyqP9vG4MKu6OMX",
  "status": "completed",
  "aggregate_scores": {
    "scorers": {
      "llm_judge": { "mean": 0.5, "pass_rate": 0.5 },
      "json_logic": { "mean": 1, "pass_rate": 1 }
    },
    "pass_rate": 0.5,
    "scored_item_count": 2,
    "pass_rate_interval": { "low": 0.09, "high": 0.91, "level": 0.95 }
  },
  "passed": true,
  "completed_count": 2,
  "errored_count": 0
}
```

One of two replies passed the judge; 0.5 meets the run's 0.5 gate. The
aggregate says how many — the results say which and why.

- `aggregate_scores` and `passed` stay `null` until the run is terminal.
- A debt appearing while the run is queued or running cancels it; start it
  again after a top-up.

## 4. Read the judge's reasoning

CLI `naturali list-eval-results` · SDK `naturali.evaluations.listEvalResults`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN/results" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    {
      "dataset_item_id": "dsit_ha9L2WskhOBFQGgQ",
      "input": [{ "role": "user", "content": "My package arrived damaged. What now?" }],
      "expected_output": null,
      "generation_id": "gen_S6D9udTeRJNCEtly",
      "output": "I am so sorry to hear your package arrived damaged. Please contact our support team here to arrange a replacement or a refund.",
      "scores": [
        { "scorer": "json_logic", "score": 1, "passed": true },
        { "scorer": "llm_judge", "score": 0.2, "passed": false, "reasoning": "The reply is polite but fails to provide a concrete next step, and it incorrectly offers a refund." }
      ],
      "passed": false,
      "error": null
    }
  ],
  "total": 2
}
```

The reply offered a refund the agent was told never to promise, and the judge
caught it with the reason in plain words — no string check could. `reasoning`
is stored with the score, so a verdict can be audited later; `generation_id`
opens the full run (`naturali-read-a-run`).

## 5. Cancel a run you no longer need

A queued run spends model budget item by item. Cancelling drops the outstanding
items and settles it `canceled`.

CLI `naturali cancel-eval-run` · SDK `naturali.evaluations.cancelEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs/$RUN/cancel" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- Results already written are kept; `aggregate_scores` stays `null`, since a
  partial roll-up would read as a whole-suite verdict.
- A run that already finished answers `400 VALIDATION_FAILED`; a two-item suite
  usually finishes in about a second.
- Cancelling is never refused for credit or plan reasons.

Done when the run is `completed` with a `passed` verdict and every result
carries the judge's `score` and `reasoning`.

## Related skills

- `naturali-build-an-eval-dataset` — the customer messages, with or without reference answers.
- `naturali-score-an-agent-change` — rerun with `baseline_run_id` for a per-scorer delta after a change.
- `naturali-roll-out-an-agent-version` — ship the fixed instructions to a share of traffic first.
