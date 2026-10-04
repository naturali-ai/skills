---
name: naturali-gate-a-rollout-on-an-eval
description: Make a naturali.ai staged rollout refuse to promote until an eval run pinned to the new agent version passes - declare the gate eval, start the release with promotion_gate, run the eval with agent_version, promote, and read the clearing run's id on the promoted version. Use when asked to gate, block or protect a release or canary on a test suite, require a passing eval before promotion, set promotion_gate, or when promote answers 409 PROMOTION_GATE_UNMET or the eval passed but the gate stays closed.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/gate-a-rollout-on-an-eval
---

# Gate a rollout on an eval

Outcome: a staged rollout that refuses to promote until an eval run pinned to
the new version passes — and a promoted version that records that run.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` and `Provider` in `naturali.yaml` (`naturali-create-an-agent`), with
  `AGENT` exported, at version 1 with no rollout running. Otherwise use its
  current version as stable below.
- `Cases`, a dataset with the cases the new version must pass, from
  `naturali-build-an-eval-dataset`.
- Each eval run generates once per case and the judge grades once per case.

Ids below are examples; use the ones your own calls return.

## 1. Declare the gate eval

The eval is what the release names as its gate. `pass_threshold: 1` means every
case must pass. Add to `naturali.yaml`:

```yaml
resources:
  Gate:
    type: eval
    properties:
      name: refund-gate
      agent_id: { ref: Agent }
      dataset_id: { ref: Cases }
      pass_threshold: 1
      scorers:
        - type: llm_judge
          ai_provider_id: { ref: Provider }
          pass_threshold: 0.7
          prompt: >-
            Rate 0-1 how well the answer matches the reference. Answer with
            {"score": <0-1>, "reasoning": "<why>"}. Question: {{input}}
            Answer: {{output}} Reference: {{expected}}
outputs:
  gate_eval_id: { ref: Gate }
```

Apply it with `naturali-deploy-a-formation`, then:

```bash
export EVAL=eval_RPMTrH6wp2eHPrC1
```

- Scorer choices and thresholds are in `naturali-score-an-agent-change`.
- Without a formation (only when the user asks): `POST …/evals` with the same
  properties (CLI `naturali create-eval` · SDK `naturali.evaluations.createEval`).

## 2. Write the new version

Edit `Agent` in `naturali.yaml` (e.g. give it the refund policy) and apply it
with `naturali-deploy-a-formation`. The plan reads:

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update" }] }
```

The agent keeps its id and moves to `version: 2`; with no release running it
serves all traffic until step 3 splits it.

## 3. Start a gated rollout

Traffic splits exactly as without a gate (`naturali-roll-out-an-agent-version`);
the gate only decides how the rollout may end.

CLI `naturali set-agent-release` · SDK `naturali.agentVersions.setAgentRelease`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "stable_version": 1, "canary_version": 2, "canary_percent": 10, "promotion_gate": "'"$EVAL"'" }'
```

```json
{
  "id": "agent_gCmLeRABaJYLeM2Z",
  "version": 2,
  "active_release": {
    "stable_version": 1,
    "canary_version": 2,
    "canary_percent": 10,
    "promotion_gate": "eval_RPMTrH6wp2eHPrC1"
  }
}
```

- The gate must be an eval of this agent in this project; anything else is a
  `400`. `null` or omitted means promote at will.

## 4. Try to promote

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

`409`:

```json
{
  "error": {
    "code": "PROMOTION_GATE_UNMET",
    "message": "Promotion gate 'eval_RPMTrH6wp2eHPrC1' has no passing eval run against version 2 of agent 'agent_gCmLeRABaJYLeM2Z'.",
    "meta": { "promotion_gate": "eval_RPMTrH6wp2eHPrC1", "agent_version": 2 }
  }
}
```

The rollout keeps running untouched: 10% of traffic still gets version 2.

## 5. Run the eval against the canary

Pin the run with `agent_version`: the whole run uses that one configuration,
whatever the traffic split.

CLI `naturali start-eval-run` · SDK `naturali.evaluations.startEvalRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/evals/$EVAL/runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true, "agent_version": 2 }'
```

```json
{
  "id": "evrun_T8ZROCSa4dTvZ7H4",
  "eval_id": "eval_RPMTrH6wp2eHPrC1",
  "agent_version": 2,
  "status": "completed",
  "aggregate_scores": {
    "scorers": { "llm_judge": { "mean": 0.8, "pass_rate": 1 } },
    "pass_rate": 1,
    "scored_item_count": 1
  },
  "passed": true
}
```

- `status: completed`, `passed: true`, `agent_version` = the canary: the three
  things the gate checks.
- A run with **no** `agent_version` measures the release's **stable** version
  (it answers `agent_version: 1`). Even passing, it cannot open the gate.
- Over 25 cases, drop `wait` and poll the run (`naturali-score-open-ended-answers`).
- A failing run leaves the gate shut: fix the agent (a new version), set the
  release again with that version as canary, and re-run pinned to it.

## 6. Promote

The same call as step 4 now succeeds.

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "agent_gCmLeRABaJYLeM2Z",
  "instructions": "Answer in one sentence. Our refund policy: refunds are accepted within 30 days of purchase. If you are unsure, say so.",
  "version": 2,
  "active_release": null
}
```

Version 2 now serves all traffic.

## 7. Read the evidence on the version

CLI `naturali list-agent-versions` · SDK `naturali.agentVersions.listAgentVersions`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/versions" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "agver_m7PsncJPs9ePvgbu", "version": 2, "label": null, "eval_run_id": "evrun_T8ZROCSa4dTvZ7H4" },
    { "id": "agver_ldzzwXGEy09kNAvK", "version": 1, "label": null, "eval_run_id": null }
  ],
  "total": 2
}
```

`eval_run_id` on version 2 is the run from step 5: anyone reading the history
later can open it and see what the version was measured against. It is null on
every version that did not go live through a gated promotion.

Done when promote returns `active_release: null` and the promoted version
carries the clearing run's `eval_run_id`.

## Related skills

- `naturali-roll-out-an-agent-version` — the ungated release: split, read versions, abort.
- `naturali-score-an-agent-change` — more cases, other scorers, per-scorer deltas against a baseline run.
- `naturali-run-an-agent-on-a-schedule` — a trigger can target an eval so the gate keeps being fed.
