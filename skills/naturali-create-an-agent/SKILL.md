---
name: naturali-create-an-agent
description: Declare a naturali.ai agent named Agent in naturali.yaml on the project's Provider - instructions, optional model, step and sampling limits - deploy it, change it later by editing the template (each change archives a new agent version), and list those versions. Use when asked to create, configure, rename or change a naturali agent or its instructions or model, see an agent's version history, try a fix on a second agent beside the original, or when an agent write answers 400 bad_request for a model, a request answers 400 SYSTEM_MESSAGE_NOT_ALLOWED, or a delete answers 409 AGENT_HAS_DEPENDENTS.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/first-agent-generation
---

# Create an agent

Outcome: an `Agent` on `Provider` that answers, versioned on every change, its
id exported as `AGENT`.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Provider` in `naturali.yaml`, from `naturali-enable-naturali-models` or
  `naturali-bring-your-own-model-key` (use your template's logical id if it
  differs).
- The template applied with `naturali-deploy-a-formation`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the agent

Add to `naturali.yaml`:

```yaml
resources:
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        ref: Provider
      instructions: Answer in one sentence. If you are unsure, say so.
outputs:
  agent_id:
    ref: Agent
```

Apply it with `naturali-deploy-a-formation`; the plan shows
`{ "logical_id": "Agent", "resource_type": "agent", "action": "create" }`.

```bash
export AGENT=agent_wq7H4Ka1eDFVsBXM   # outputs.agent_id
```

Reading it back (`GET …/agents/{agent_id}`, CLI `naturali get-agent`) shows
`"model": null`, `"max_steps": 20`, `"version": 1`.

- Only the model source is required: exactly one of `ai_provider_id` or
  `model_route_id`.
- `model` unset (`null`) uses the provider's `default_model`. Set it to pick
  another: a catalog `model` on a managed provider (one of the same source,
  else `400 bad_request`), the vendor's own id on your own key.
- `instructions` is the system prompt; a request carrying a `system` message is
  `400 SYSTEM_MESSAGE_NOT_ALLOWED`.
- Other common keys: `temperature`, `max_steps` (steps per turn, default 20),
  `max_context_messages`. Tools, knowledge, memory, output schema and
  zero-retention each have their own skill.
- Without a formation (only when the user asks): `POST …/agents` with the same
  properties and `ai_provider_id: $PROVIDER` (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

## 2. Change it: a new version

Edit the agent in `naturali.yaml`:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        ref: Provider
      instructions: 'Answer in one sentence, then ask: Anything else I can help with?'  # changed
```

Plan and apply it with `naturali-deploy-a-formation`. The plan shows one
`update` for `Agent` with `diff.desired.instructions` and
`diff.current.instructions`; the agent keeps its id and moves to `version` 2.

- Any write that changes the config archives a version, through a formation or
  the API alike; a write that changes nothing does not.
- Without a formation: `PATCH …/agents/{agent_id}` (CLI `naturali patch-agent` ·
  SDK `naturali.agents.patchAgent`). `PUT` and `PATCH` are both partial.
- To try a fix while the original keeps serving and stays comparable, declare a
  second agent (`AgentV2`) with the new instructions instead of editing `Agent`.

## 3. List the versions

CLI `naturali list-agent-versions` · SDK `naturali.agents.listAgentVersions`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/versions" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "version": 2, "config": { "instructions": "Answer in one sentence, then ask: Anything else I can help with?" } },
    { "version": 1, "config": { "instructions": "Answer in one sentence. If you are unsure, say so." } }
  ],
  "total": 2, "limit": 50, "offset": 0
}
```

- Newest first; each `config` holds every mutable field as it stood. One
  version: `GET …/versions/{version}` (CLI `naturali get-agent-version`).
- Every generation records the `agent_version` that served it, so a change can
  be pinned to the run it affected.
- Deleting an agent that has run is `409 AGENT_HAS_DEPENDENTS`
  (`error.meta.generation_count`, `trace_count`); `?force=true` deletes its
  generations and traces too. See teardown in `naturali-deploy-a-formation`.

Done when `GET …/agents/$AGENT` shows the instructions you declared and the
versions list holds one entry per change.

## Related skills

- `naturali-run-a-generation` — run the agent.
- `naturali-roll-out-an-agent-version` — serve a new version to part of the traffic first.
- `naturali-give-an-agent-an-http-tool` — bind a tool to `Agent`.
- `naturali-return-structured-output` — make it reply with a JSON object.
- `naturali-stop-storing-conversation-content` — make it zero-retention.
