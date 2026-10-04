---
name: naturali-roll-out-an-agent-version
description: Ship a naturali.ai agent change as a new version by updating its formation template, serve it to a share of traffic beside the current one with a canary release, see which version answered each run, and promote or abort in one call. Use when asked for a canary, staged rollout, A/B split or gradual release of an agent change, to compare agent versions, to promote or roll back a naturali agent version, or to read agent_version on generations.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/roll-out-an-agent-version
---

# Roll out an agent version

Outcome: an agent whose new instructions went live through a staged rollout —
served to a share of the traffic beside the old version, measured per run, and
promoted in one call.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT`, `PROVIDER`, `FORMATION`, `AGENT` and the `agent.yaml` template
  from `naturali-first-agent-generation`, the agent still at `version` 1.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Write a new version

Any config-changing update archives a new version. Make the change visible in
a reply: edit `agent.yaml` so the agent's `instructions` read:

```yaml
      instructions: "Answer in one sentence, then ask: Anything else I can help with?"
```

Plan, then apply:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [{ "logical_id": "Agent", "action": "update", "physical_resource_id": "agent_6a0WCYOBLQZOYvYz" }] }
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
  "outputs": { "agent_id": "agent_6a0WCYOBLQZOYvYz" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The agent is now at `version` 2 with `active_release: null`. Version 1 stays
  in the archive: `GET /v1/projects/{project_id}/agents/{agent_id}/versions`
  lists both, each with its exact `config`.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  the new `instructions` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 2. Start the rollout

`canary_percent` of the traffic gets `canary_version`, the rest
`stable_version`. The release has its own route, not a template
property, so this and promote stay direct calls.

CLI `naturali set-agent-release` · SDK `naturali.agentVersions.setAgentRelease`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "stable_version": 1, "canary_version": 2, "canary_percent": 50 }'
```

```json
{ "version": 2, "active_release": { "stable_version": 1, "canary_version": 2, "canary_percent": 50, "promotion_gate": null } }
```

- 50 shows both sides in a few runs; start much lower in production.
- A request in a session is assigned by the session's actor (or the session),
  so one end user always gets one version. A request with neither is split at
  random.

## 3. Send traffic

Run the same question a few times.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What is our refund window?" }] }'
```

```json
{ "id": "gen_44nXn9OGAJaIr2wu", "status": "completed",
  "output": { "content": "You have 30 days … Anything else I can help with?" } }
```

## 4. See which version answered

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
    { "id": "gen_8ADWHOnm2JtQC42C", "agent_version": 1, "status": "completed" }
  ],
  "total": 4
}
```

- All on one side? Run step 3 a few more times; the split is random here.
- Group by `agent_version` to compare answers, errors and cost.

## 5. Promote the new version

Makes the canary the live configuration and ends the rollout.

CLI `naturali promote-agent-release` · SDK `naturali.agentVersions.promoteAgentRelease`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/release/promote" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "agent_6a0WCYOBLQZOYvYz", "version": 2, "active_release": null }
```

- Promoting again answers `409 NO_ACTIVE_RELEASE`.
- To roll back instead, `POST /v1/projects/{project_id}/agents/{agent_id}/release/abort`
  puts the stable version back live. Neither call writes a new version.
  After an abort, revert `instructions` in `agent.yaml` too, so the template
  describes the live agent again.

Done when `active_release` is `null` and, after running step 3 again, step 4
shows every new run at `agent_version` 2.

## Related skills

- `naturali-score-an-agent-change` — measure the new version on a dataset before it gets traffic.
- `naturali-gate-a-rollout-on-an-eval` — promote only on a passing eval with `promotion_gate`.
