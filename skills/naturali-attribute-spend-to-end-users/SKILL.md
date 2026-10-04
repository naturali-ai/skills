---
name: naturali-attribute-spend-to-end-users
description: Attribute a naturali.ai project's agent spend to each end user with one actor per user and sessions opened as that actor, then read usage grouped by actor. Use when asked to track, report or bill usage or cost per customer or end user, create actors, open a session for an end user, find which user spent the tokens, or explain the null bucket in usage grouped by actor.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/cap-spend-per-end-user
---

# Attribute spend to end users

Outcome: every turn billed to the end user behind it, and the project's spend
read back split per user.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with `Agent` in it, from
  `naturali-create-an-agent`.

Ids below are examples; use the ones your own calls return.

## 1. Declare an actor per end user, and sessions as them

An actor is your end user's identity in the project: spend is attributed to
it, and an `actor`-scoped quota caps it. Attribution is set on the session:
every turn in a session with `actor_id` is billed to that actor. Add to
`naturali.yaml`:

```yaml
resources:
  Ada:
    type: actor
    properties:
      name: Ada
      external_id: "+15551230001"
  Blake:
    type: actor
    properties:
      name: Blake
      external_id: "+15551230002"
  AdaSession:
    type: session
    properties:
      agent_id: { ref: Agent }
      actor_id: { ref: Ada }
  BlakeSession:
    type: session
    properties:
      agent_id: { ref: Agent }
      actor_id: { ref: Blake }
outputs:
  ada_id: { ref: Ada }
  blake_id: { ref: Blake }
  session_id: { ref: AdaSession }
  blake_session_id: { ref: BlakeSession }
```

Apply it with `naturali-deploy-a-formation` (four `create`s), then read the
outputs:

```bash
export ADA=actor_Uv6w8P36z5gwrpcO
export BLAKE=actor_PdAP1cTcRB3xGV2X
export SESSION=sess_mj9U4NYxqdBMfQ9y
export BLAKE_SESSION=sess_Wf2Lq9tRz4XcB6hA
```

- `external_id` is your own key for the user (phone, account id). Quote it: a
  bare `+15551230001` is a YAML number.
- A session opened without `actor_id` has no end user: its spend lands in the
  `null` bucket and no `actor` quota ever applies to it.
- End users who arrive at runtime are not in a template: create the actor on
  each inbound message with `POST …/actors` `{ "name", "external_id" }` (CLI
  `naturali create-actor` · SDK `naturali.actors.createActor`). It is
  idempotent on `external_id` — `200` with the existing actor instead of `201`
  — so no lookup is needed first. Then `POST …/sessions`
  `{ "agent_id", "actor_id" }` (CLI `naturali create-session` · SDK
  `naturali.sessions.createSession`).

## 2. Run a turn as Ada

Add her message, then generate; `?wait=true` returns the reply instead of
`202`. More turns, reading back and auto-generation are in
`naturali-converse-in-a-session`.

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Name one use for a paperclip." }'
```

CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "message": { "role": "assistant", "content": "It can hold papers together to keep them organized." },
  "generation_id": "gen_75KEqGukuWyk0qQp",
  "trace_id": "trace_dSRX56VdezF4qGEE"
}
```

## 3. Read spend per end user

`group_by=actor` splits the project's spend by the end user behind it.

CLI `naturali get-project-usage` · SDK `naturali.projects.getProjectUsage`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/usage" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d group_by=actor \
  -d meter_type=llm_tokens
```

```json
{
  "group_by": "actor",
  "meter_type": "llm_tokens",
  "cost_usd": 0.00003383,
  "total_tokens": 191,
  "groups": {
    "data": [
      { "key": null, "cost_usd": 0.00002488, "total_tokens": 115, "event_count": 2 },
      { "key": "actor_Uv6w8P36z5gwrpcO", "cost_usd": 0.00000895, "total_tokens": 76, "event_count": 1 }
    ],
    "total": 2, "limit": 50, "offset": 0
  }
}
```

- `key` is the actor id. `null` is every generation with no end user behind it
  (here two made without an actor); no actor quota ever counts it.
- One user alone: pass `actor_id=$ADA` instead of `group_by`.
- `groups` is paged (`total`, `limit`, `offset`); add `from`/`to` for a window.

Done when Ada's actor id appears as a `key` in `groups.data` with her turn's
tokens.

## Related skills

- `naturali-cap-spend-per-end-user` — one quota that gives each of these actors its own budget.
- `naturali-converse-in-a-session` — the full multi-turn session flow these turns use.
- `naturali-cap-project-spend` — a pooled cap over the whole project, sized from usage by day.
