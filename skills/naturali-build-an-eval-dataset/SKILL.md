---
name: naturali-build-an-eval-dataset
description: Build a naturali.ai eval dataset from declared test cases and from real completed generations, so production mistakes become regression tests. Use when asked to create a dataset, test cases or fixtures for evals, write a regression suite, turn a bad answer into a test case, or when curating answers 409 GENERATION_NOT_COMPLETED, GENERATION_CONTENT_UNAVAILABLE or QUOTA_STORAGE_EXCEEDED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/score-an-agent-change
---

# Build an eval dataset

Outcome: a dataset of test cases an eval can score an agent against —
hand-written cases plus ones curated from real traffic.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- To curate: `GENERATION`, a completed generation the agent got wrong (from
  `naturali-run-a-generation` or `naturali-converse-in-a-session`).

Ids below are examples; use the ones your own calls return.

## 1. Declare the dataset and its cases

A dataset is a named collection of cases. Nothing about it is agent-specific:
the same dataset can score several agents and survives every agent change. A
case is the `input` messages replayed verbatim to the agent and, optionally,
the `expected_output` scorers compare against. Add to `naturali.yaml`:

```yaml
resources:
  Cases:
    type: dataset
    properties:
      name: billing-regressions
      description: Questions the billing agent must get right
  InvoiceCase:
    type: dataset_item
    properties:
      dataset_id: { ref: Cases }
      input:
        - role: user
          content: When is my invoice issued?
      expected_output: Invoices are issued on the first of each month.
      metadata:
        topic: billing
outputs:
  dataset_id: { ref: Cases }
```

Apply it with `naturali-deploy-a-formation`, then:

```bash
export DATASET=dset_270ATibup5AdwKwQ
```

- `name` is unique within the project.
- `expected_output` is the reference for `exact_match`, `contains`,
  `embedding_similarity` and `llm_judge` (`{{expected}}`). For answers with no
  single right wording, graded by a rubric (`naturali-score-open-ended-answers`),
  leave it out — the rubric is the standard:

  ```yaml
  resources:
    Replies:
      type: dataset
      properties:
        name: reply-drafts
        description: Customer messages with no single right reply
    DamagedCase:
      type: dataset_item
      properties:
        dataset_id: { ref: Replies }
        input:
          - role: user
            content: My package arrived damaged. What now?
    ChargedTwiceCase:
      type: dataset_item
      properties:
        dataset_id: { ref: Replies }
        input:
          - role: user
            content: I was charged twice this month.
  outputs:
    replies_dataset_id: { ref: Replies }
  ```

- `metadata` is yours, opaque to the platform; `json_logic` and `tool` scorers
  read it, and an eval's `group_by` rolls scores up per value of one key.
- Editing or removing a case never rewrites a run that already scored it — each
  result froze its own copy.
- Deleting the dataset deletes its cases and every eval bound to it.
- Without a formation (only when the user asks): `POST …/datasets` (CLI
  `naturali create-dataset` · SDK `naturali.evaluations.createDataset`) and
  `POST …/datasets/{dataset_id}/items` (CLI `naturali create-dataset-item` ·
  SDK `naturali.evaluations.createDatasetItem`) with the same properties.

## 2. Curate a case from real traffic

The cases that matter are usually the ones the agent already got wrong.
Promote a completed generation: its input becomes the case's `input`, and its
own answer becomes `expected_output` unless you supply one. Here the agent
admitted it did not know, so supply the answer it should have given.

CLI `naturali create-dataset-item-from-generation` · SDK `naturali.evaluations.createDatasetItemFromGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/datasets/$DATASET/items/from-generation" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "generation_id": "'"$GENERATION"'",
        "expected_output": "Refunds are accepted within 30 days of purchase."
      }'
```

```json
{
  "id": "dsit_fD6cAKjaxvBTmEgN",
  "dataset_id": "dset_270ATibup5AdwKwQ",
  "input": [{ "role": "user", "content": "What is our refund window?" }],
  "expected_output": "Refunds are accepted within 30 days of purchase.",
  "metadata": null,
  "source_generation_id": "gen_7EZdyuFLY96IOQAN"
}
```

- `"expected_output": null` stores the case with no reference answer; optional
  `metadata` as above.
- The case is a **copy**, not a view: it keeps working after the generation's
  content is purged, and `source_generation_id` goes null if the generation is
  deleted. Erasing production data never quietly empties the suite.
- A case curated this way is not in the template and is never touched by a
  formation apply.
- `409 GENERATION_NOT_COMPLETED`: still running or failed.
  `409 GENERATION_CONTENT_UNAVAILABLE`: content never stored (agent or project
  on `trace_content_mode: none`), purged or expired. `409
  QUOTA_STORAGE_EXCEEDED`: the project's `storage_bytes` quota is full.
- A generation from another project than the dataset is a `400`.

Done when the deploy outputs `dataset_id` and the curated case comes back with
its `source_generation_id`.

## Related skills

- `naturali-score-an-agent-change` — an eval over this dataset: verdict and per-scorer delta after a change.
- `naturali-score-open-ended-answers` — a rubric judge over cases with no reference answer.
- `naturali-gate-a-rollout-on-an-eval` — the dataset behind a release's promotion gate.
- `naturali-replay-a-turn` — find and fix the bad turn before curating it.
