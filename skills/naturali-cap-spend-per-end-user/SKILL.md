---
name: naturali-cap-spend-per-end-user
description: Give every end user of a naturali.ai project their own token budget with one actor-scope quota in the formation template - proven by one user refused with 429 QUOTA_EXCEEDED while another, under the same quota, still gets an answer - then raise it to a real monthly allowance or give one user a different one. Use when asked to limit, budget or rate-limit spend per customer or end user, set a per-user monthly token allowance, stop one user exhausting the project's budget, or explain a 429 QUOTA_EXCEEDED "Quota exceeded for actor." or a 400 "scope actor is not valid for metric requests".
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/cap-spend-per-end-user
---

# Cap spend per end user

Outcome: one quota, a separate budget for each end user — one user refused
while another under the same quota still gets an answer.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with actors `Ada` and `Blake` and
  sessions as them, from `naturali-attribute-spend-to-end-users`: `ADA`,
  `SESSION` (Ada's, with one turn already run) and `BLAKE_SESSION` exported.
  Only turns in a session with an `actor_id` are ever capped.

Ids below are examples; use the ones your own calls return.

## 1. Cap every end user with one quota

For `scope: actor`, no `scope_ref` means **one budget per actor**, not a pooled
total: one user exhausting theirs never blocks another. The limit is set below
Ada's first turn (76 tokens) so step 2 has something to refuse. Add to
`naturali.yaml`:

```yaml
resources:
  PerUserCap:
    type: quota
    properties:
      scope: actor
      metric: tokens
      window: calendar_month
      limit: 50
outputs:
  quota_id: { ref: PerUserCap }
```

Apply it with `naturali-deploy-a-formation`; the plan reports `create` for
`PerUserCap` and `no-op` for the rest.

```bash
export QUOTA=quota_9vWy3AaYZM03UlB2
```

- `mode` defaults to `enforce`; use `monitor` first to watch before refusing
  anyone (see `naturali-cap-project-spend`).
- `tokens` or `cost_usd` only: `requests` with `scope: actor` →
  `400 VALIDATION_FAILED` (`scope "actor" is not valid for metric "requests".`).
- `current_usage` is `null` on a token quota: the meter is read at check time.
- Without a formation (only when the user asks): `POST …/quotas` with the same
  properties (CLI `naturali create-quota` · SDK `naturali.quotas.createQuota`).

## 2. Prove it: Ada is refused, Blake is not

Send Ada's next message, then generate with `?wait=true`:

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "And one more?" }'
```

CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -i -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```http
HTTP/2 429
retry-after: 2471118
```

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Quota exceeded for actor.",
    "meta": {
      "quota_id": "quota_9vWy3AaYZM03UlB2",
      "metric": "tokens",
      "limit": 50,
      "window": "calendar_month",
      "resets_at": "2026-11-01T00:00:00.000Z"
    }
  }
}
```

- The message is saved; the generation is refused before the model is called
  and nothing is metered. `Retry-After` is seconds until the window resets.
- Only with `?wait=true`: a background generate answers `202` before the quota
  is read.

Now Blake, under the same quota — the same two calls against
`$BLAKE_SESSION` with `"Name one use for a paperclip."`:

```json
{
  "status": "completed",
  "message": { "role": "assistant", "content": "You can use a paperclip to hold multiple sheets of paper together." },
  "generation_id": "gen_ajNWChYJJfP05PFt"
}
```

- The check runs before a generation starts and never stops one in flight, so
  a user can overshoot by at most one generation — which is how Blake's first
  turn completes even if it alone crosses the limit.

## 3. Raise the cap to a real budget

Set the monthly allowance you want per user on `PerUserCap`:

```yaml
  PerUserCap:
    type: quota
    properties:
      scope: actor
      metric: tokens
      window: calendar_month
      limit: 100000   # changed
```

Apply it with `naturali-deploy-a-formation`; the plan must report `update` for
`PerUserCap` with `physical_resource_id` `$QUOTA`.

- Only `limit` and `mode` (and `on_unpriced` on `cost_usd`) change in place.
- Generating again against `$SESSION` now answers Ada's saved message: the
  meter is read live, there is no counter to reset.
- A different allowance for one user: add a second quota with
  `scope: actor` and `scope_ref: { ref: Ada }`. It does not replace the
  per-user one: every applicable quota is checked and the tightest breach wins.
- Without a formation (only when the user asks): `PATCH …/quotas/{quota_id}`
  with `{ "limit": 100000 }` (CLI `naturali update-quota` · SDK
  `naturali.quotas.updateQuota`).

Done when Ada's generation answered `429 QUOTA_EXCEEDED` naming `$QUOTA`
while Blake's, under the same quota, came back `completed`.

## Related skills

- `naturali-attribute-spend-to-end-users` — the actors, sessions and per-actor usage this quota caps.
- `naturali-cap-project-spend` — a pooled cap over the whole project, sized in `monitor` mode first.
- `naturali-converse-in-a-session` — the session turns refused and answered here.
