---
name: naturali-roll-out-an-agent-version
description: Serve a new naturali.ai agent version to a share of traffic beside the current one, read which version answered each generation, then promote it in one call or abort back to the old one. Use when asked for a canary, staged, gradual or percentage rollout, an A/B split between two agent versions, to raise the canary share, to see which version served a run, to promote or roll back a release, or when promote answers 409 NO_ACTIVE_RELEASE.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/roll-out-an-agent-version
---

# Roll out an agent version

Outcome: a new agent version live through a staged rollout — served to a share
of the traffic beside the old version, measured per run, promoted in one call.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` with two archived versions, `AGENT` exported: the one serving
  (stable, e.g. 1) and the change (canary, e.g. 2). Edit `Agent` in
  `naturali.yaml` and apply it with `naturali-deploy-a-formation` — every config
  change archives a new version (see `naturali-create-an-agent`). Read the
  numbers with `GET …/agents/$AGENT/versions`.
- With no release running, the new version serves all traffic as soon as the
  update applies: start the rollout (step 1) right after it.

Ids below are examples; use the ones your own calls return.

## 1. Start the rollout

`canary_percent` of the traffic gets `canary_version`, the rest
`stable_version`. A release has its own route, not a template property.

CLI `naturali set-agent-release` · SDK `naturali.agentVersions.setAgentRelease`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "stable_version": 1, "canary_version": 2, "canary_percent": 50 }'
```

```json
{
  "id": "agent_6a0WCYOBLQZOYvYz",
  "version": 2,
  "active_release": {
    "stable_version": 1,
    "canary_version": 2,
    "canary_percent": 50,
    "promotion_gate": null
  }
}
```

- Both versions must exist and differ (`400` otherwise); `canary_percent` is an
  integer 0–100. 50 shows both sides in a few runs; in production start lower.
- The same `PUT` replaces a running release: raise `canary_percent` step by
  step, or add a `promotion_gate` (`naturali-gate-a-rollout-on-an-eval`).
- Assignment hashes the session's actor, else the session: one end user always
  gets the same version, so a conversation never switches config halfway. A
  request with neither (a bare agent generate) is split at random.
- While a release runs, further edits to `Agent` (formation update or direct
  write) archive new versions as **drafts**; neither side of the split moves.

## 2. Send traffic

Run the same question a few times (`naturali-run-a-generation` has the details).

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What is our refund window?" }] }'
```

```json
{
  "id": "gen_44nXn9OGAJaIr2wu",
  "status": "completed",
  "output": { "content": "You have 30 days from the date of purchase to request a refund for eligible items. Anything else I can help with?" }
}
```

## 3. See which version answered

Every generation records the `agent_version` that served it.

CLI `naturali list-generations` · SDK `naturali.generations.listGenerations`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations?agent_id=$AGENT" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "gen_44nXn9OGAJaIr2wu", "agent_version": 2, "status": "completed" },
    { "id": "gen_8ADWHOnm2JtQC42C", "agent_version": 1, "status": "completed" },
    { "id": "gen_CbbfP9Go13L5gRpP", "agent_version": 1, "status": "completed" }
  ],
  "total": 3
}
```

- Group by `agent_version` to compare the versions' answers, errors and cost.
- All on one side? Run step 2 a few more times — the split is random for
  requests without a session.

## 4. Promote the new version

Makes the canary the agent's live configuration and ends the rollout.

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "agent_6a0WCYOBLQZOYvYz",
  "instructions": "Answer in one sentence, then ask: Anything else I can help with?",
  "version": 2,
  "active_release": null
}
```

- `active_release: null`: the rollout is over. Promoting again answers
  `409 NO_ACTIVE_RELEASE`.
- Promote pins the canary **by number**: a draft edited in mid-rollout is not
  promoted in its place; it stays unreleased in the version history.
- Prove it: repeat steps 2 and 3 — every new run is `agent_version: 2`.

To roll back instead, abort: the stable version's config goes back live and all
traffic returns to it. Neither promote nor abort writes a new version.

CLI `naturali abort-agent-release` · SDK `naturali.agentVersions.abortAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/abort" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- After an abort, revert `Agent` in `naturali.yaml` to the stable config;
  otherwise the next formation update writes the abandoned config back.
- Abort with no release running answers `409`.

Done when `active_release` is `null` and new generations all carry the promoted
`agent_version`.

## Related skills

- `naturali-gate-a-rollout-on-an-eval` — refuse to promote until an eval run on the canary passes.
- `naturali-score-an-agent-change` — measure the new version against a dataset before it gets traffic.
- `naturali-create-an-agent` — writing the new version and listing versions.
- `naturali-converse-in-a-session` — sessions, whose actor keeps one end user on one version.
