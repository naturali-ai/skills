---
name: naturali-cap-spend-per-end-user
description: Declare naturali.ai actors and actor-bound sessions in a formation template and deploy it to attribute agent spend to each end user, read usage grouped by actor, and give every end user their own token budget with one actor-scope quota added to the template — proven by one user refused with 429 QUOTA_EXCEEDED while another still gets an answer. Use when asked to limit, budget or rate-limit spend per customer or end user, track usage per user, create naturali actors, open a session for an end user, or set a per-user monthly token allowance.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/cap-spend-per-end-user
---

# Cap spend per end user

Outcome: one quota that gives every end user their own token budget — proven by
one user being refused while another, under the same quota, still gets an
answer.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key (or a session JWT), and
  `NATURALI_API=https://api.naturali.ai/v1` for the curl calls.
- `PROJECT` and `AGENT` — a working agent, from `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Declare an actor and a session per end user

An actor is your end user's identity: spend is attributed to it, and an
`actor`-scoped quota caps it. Every turn in a session with `actor_id` is billed
to that actor; a session without one has no end user, and no `actor` quota ever
applies to it. Declare Ada and Blake, keyed by your own identifier for them,
each with a session. Save as `end-users.yaml`:

```yaml
parameters:
  AgentId:
    type: string
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
      agent_id:
        param: AgentId
      actor_id:
        ref: Ada
  BlakeSession:
    type: session
    properties:
      agent_id:
        param: AgentId
      actor_id:
        ref: Blake
outputs:
  ada_id:
    ref: Ada
  blake_id:
    ref: Blake
  session_id:
    ref: AdaSession
  blake_session_id:
    ref: BlakeSession
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t end-users.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t end-users.yaml --arg a "$AGENT" \
        '{name: "end-users", template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "id": "form_Pd5xN8kWm2RgY7vC", "status": "active", "error": null,
  "outputs": { "ada_id": "actor_Uv6w8P36z5gwrpcO", "blake_id": "actor_PdAP1cTcRB3xGV2X",
               "session_id": "sess_mj9U4NYxqdBMfQ9y", "blake_session_id": "sess_Wf2Lq9tRz4XcB6hA" } }
```

```bash
export FORMATION=form_Pd5xN8kWm2RgY7vC
export ADA=actor_Uv6w8P36z5gwrpcO
export BLAKE=actor_PdAP1cTcRB3xGV2X
export SESSION=sess_mj9U4NYxqdBMfQ9y
export BLAKE_SESSION=sess_Wf2Lq9tRz4XcB6hA
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Quote `external_id`: a bare `+15551230001` is a YAML number.
- Only when the user asks for direct calls: `POST …/actors` once per user with
  `{ "name", "external_id" }` (CLI `naturali create-actor` · SDK
  `naturali.actors.createActor`) — idempotent on `external_id` (`200` with the
  same actor instead of `201`), so it can run on every inbound message — and
  `POST …/sessions` with `{ "agent_id", "actor_id" }` (CLI
  `naturali create-session` · SDK `naturali.sessions.createSession`).

## 2. Run a turn

Add Ada's message, then generate; `?wait=true` returns the reply instead of
`202 Accepted`.

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`
CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Name one use for a paperclip." }'

curl -X POST "$NATURALI_API/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "status": "completed",
  "message": { "role": "assistant", "content": "It can hold papers together to keep them organized." },
  "generation_id": "gen_75KEqGukuWyk0qQp" }
```

## 3. Read spend per end user

`group_by=actor` splits the project's spend by the end user behind it.

CLI `naturali get-project-usage` · SDK `naturali.projects.getProjectUsage`

```bash
curl -G "$NATURALI_API/projects/$PROJECT/usage" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d group_by=actor \
  -d meter_type=llm_tokens
```

```json
{ "group_by": "actor", "total_tokens": 191,
  "groups": { "data": [
    { "key": null, "total_tokens": 115, "event_count": 2 },
    { "key": "actor_Uv6w8P36z5gwrpcO", "total_tokens": 76, "event_count": 1 }
  ], "total": 2 } }
```

- Ada's turn cost 76 tokens. The `null` bucket (no actor) is never counted by
  an actor quota.
- Pass `actor_id=$ADA` instead of `group_by` to read one user's total alone.

## 4. Cap every end user with one quota

For `scope: actor`, no `scope_ref` means one budget per actor, not one pooled
total. The limit is deliberately below Ada's 76 tokens so step 5 has something
to refuse. Add to `end-users.yaml`:

```yaml
resources:
  # …the actors and sessions above
  PerUserCap:
    type: quota
    properties:
      scope: actor
      metric: tokens
      window: calendar_month
      limit: 50
outputs:
  # …
  quota_id:
    ref: PerUserCap
```

Plan the change (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t end-users.yaml --arg f "$FORMATION" --arg a "$AGENT" \
        '{formation_id: $f, template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "changes": [{ "logical_id": "PerUserCap", "resource_type": "quota", "action": "create" }] }
```

Every other resource should read `no-op`.

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t end-users.yaml --arg a "$AGENT" \
        '{template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "id": "form_Pd5xN8kWm2RgY7vC", "status": "active", "error": null,
  "outputs": { "quota_id": "quota_9vWy3AaYZM03UlB2" } }
```

```bash
export QUOTA=quota_9vWy3AaYZM03UlB2
```

- `mode` defaults to `enforce`. `current_usage` on the quota is null for a
  token quota.
- An end user can be capped on `tokens` or `cost_usd`, not `requests`:
  `400 VALIDATION_FAILED` (`scope "actor" is not valid for metric "requests".`).
- Only when the user asks for direct calls: `POST …/quotas` with the same
  properties as the body (CLI `naturali create-quota` · SDK
  `naturali.quotas.createQuota`).

## 5. Prove it: Ada is refused, Blake is not

Send Ada's next message and generate, as in step 2:

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`
CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "And one more?" }'

curl -i -X POST "$NATURALI_API/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

The message is saved; the generation is refused before the model is called,
with `Retry-After` in seconds until the window resets:

```http
HTTP/2 429
retry-after: 2471118
```

```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Quota exceeded for actor.",
  "meta": { "quota_id": "quota_9vWy3AaYZM03UlB2", "metric": "tokens", "limit": 50,
            "window": "calendar_month", "resets_at": "2026-11-01T00:00:00.000Z" } } }
```

Now Blake, under the same quota, in the session step 1 declared for him (same
two calls):

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/sessions/$BLAKE_SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Name one use for a paperclip." }'

curl -X POST "$NATURALI_API/projects/$PROJECT/sessions/$BLAKE_SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "status": "completed",
  "message": { "role": "assistant", "content": "You can use a paperclip to hold multiple sheets of paper together." } }
```

- The check runs before a generation starts and never stops one in flight, so
  a user can overshoot by at most one generation.

## 6. Raise the cap to a real budget

`limit` and `mode` are the only fields a quota lets you change. In
`end-users.yaml`:

```yaml
      limit: 100000
```

Plan as in step 4, then apply:

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t end-users.yaml --arg a "$AGENT" \
        '{template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "id": "form_Pd5xN8kWm2RgY7vC", "status": "active", "error": null,
  "outputs": { "quota_id": "quota_9vWy3AaYZM03UlB2" } }
```

- The plan must say `update` for `PerUserCap`: the quota keeps its id.
- Generating again against `$SESSION` now answers Ada's refused message; the
  meter is read live, no counter to reset.
- For one user's different allowance, add a second `actor` quota with
  `scope_ref` set to that actor's id (`ref: Ada`). Every applicable quota is
  checked; the tightest breach wins.
- Only when the user asks for direct calls: `PATCH …/quotas/{quota_id}` with
  `{ "limit": 100000 }` (CLI `naturali update-quota` · SDK
  `naturali.quotas.updateQuota`).

Done when Ada's generation answered `429 QUOTA_EXCEEDED` naming `$QUOTA` while
Blake's, under the same quota, came back `completed`.

## Related skills

- `naturali-cap-project-spend` — a pooled cap over the whole project, sized in `monitor` mode before it is enforced.
- `naturali-first-agent-generation` — the agent these sessions run on.
