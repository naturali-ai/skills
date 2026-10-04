---
name: naturali-cap-project-spend
description: Put a token budget on a whole naturali.ai project - size it from the project's daily usage, declare a project-scope quota in monitor mode in the formation template, check the audit log for quotas:MonitorBreach, switch it to enforce, and prove it refuses a generation with 429 QUOTA_EXCEEDED before the model is called. Use when asked to cap, limit or budget a project's spend or tokens, set a daily or monthly spend limit, size a quota from usage history, watch a cap before enforcing it, stop a runaway agent, or explain a 429 QUOTA_EXCEEDED, a 409 QUOTA_CONFLICT or a cost_usd cap that never fires.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/cap-project-spend
---

# Cap a project's spend

Outcome: a quota that stops the project spending past a budget sized from its
own history — watched in `monitor` first, then enforced and seen to refuse.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
  Quotas are on every plan and need only the `member` role.
- `naturali.yaml` deployed as `$FORMATION`, with `Agent` in it, from
  `naturali-create-an-agent`; `AGENT` — its id (step 5 makes one generation).
- Cap `tokens`, not `cost_usd`, unless every provider is managed. `cost_usd`
  sums *priced* cost and only managed models are priced: on your own key the
  total is `0`, the cap never breaches, and the runtime files a
  `quota_unpriced` exception instead. `tokens` is always recorded.

Ids below are examples; use the ones your own calls return.

## 1. Size the cap from real usage

`group_by=day` buckets the meter by calendar day; `meter_type=llm_tokens` keeps
storage and request meters out.

CLI `naturali get-project-usage` · SDK `naturali.projects.getProjectUsage`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/usage" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d group_by=day \
  -d meter_type=llm_tokens \
  -d from=2026-07-01T00:00:00Z
```

```json
{
  "group_by": "day",
  "cost_usd": 0.509007895,
  "total_tokens": 21236,
  "groups": {
    "data": [
      { "key": "2026-10-02", "total_tokens": 3108, "event_count": 9 },
      { "key": "2026-10-01", "total_tokens": 12050, "event_count": 58 }
    ],
    "total": 5, "limit": 50, "offset": 0
  }
}
```

- Size against the **busiest** day, not the average: a mean-sized cap fires on
  every ordinary peak. Days are not in date order; compare them all.
- `groups` is paged: `total` counts every bucket, so page with `offset` when it
  exceeds `limit`.
- About 3× the busiest day leaves room to grow and still catches a runaway
  within hours: 12,050 → 40,000.
- `cost_usd` is `null` on a project that only uses your own provider — a
  `cost_usd` quota there would be dead on arrival.
- A token cap is not a dollar cap: the same tokens cost very different amounts
  per model. Re-check it whenever an agent's `model` changes; reasoning tokens
  count as output tokens.

## 2. Declare the quota in monitor mode

`monitor` aggregates and reports exactly as `enforce` does, then lets the work
through. `scope: project` with no `scope_ref` is the whole project pooled. Add
to `naturali.yaml`:

```yaml
resources:
  DailyCap:
    type: quota
    properties:
      scope: project
      metric: tokens
      window: rolling_24h
      limit: 40000
      mode: monitor
outputs:
  quota_id: { ref: DailyCap }
```

Apply it with `naturali-deploy-a-formation`; the plan reports
`{ "logical_id": "DailyCap", "resource_type": "quota", "action": "create" }`.

```bash
export QUOTA=quota_jTfCP8QSLQm3mGlw
```

- Identity is `scope`, `scope_ref`, `metric`, `window`, `meter_type`: a second
  quota with the same five → `409 QUOTA_CONFLICT`.
- `current_usage` is `null` on a token quota by design: the meter is aggregated
  at check time. Only `requests` quotas keep a counter.
- A new quota counts history: the window looks back from now, so a quota can be
  born breached. After an incident, wait out the window (24 hours, or the 1st
  of the month for `calendar_month`) before enforcing.
- Without a formation (only when the user asks): `POST …/quotas` with the same
  properties (CLI `naturali create-quota` · SDK `naturali.quotas.createQuota`).

## 3. Watch what would have breached

A monitor breach writes one `quotas:MonitorBreach` audit entry per window, not
one per request. After a window of real traffic:

CLI `naturali list-audit-entries` · SDK `naturali.auditLog.listAuditEntries`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/audit-log" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d action=quotas:MonitorBreach
```

```json
{
  "data": [
    { "action": "quotas:MonitorBreach", "resource_public_id": "quota_jTfCP8QSLQm3mGlw",
      "created_at": "2026-08-31T09:41:02.000Z" }
  ],
  "next_cursor": null
}
```

- Empty list: enforcing will interrupt no one. Entries: the limit is too low —
  raise `limit`, update the formation, watch another window.
- The audit log is included from the Business plan; below it this answers
  `403 plan_feature_not_included`. Then re-run step 1 at each window's end and
  compare the busiest day to the limit.

## 4. Switch it to enforce

Edit the quota in `naturali.yaml`:

```yaml
  DailyCap:
    type: quota
    properties:
      scope: project
      metric: tokens
      window: rolling_24h
      limit: 40000
      mode: enforce   # changed
```

Apply it with `naturali-deploy-a-formation`; the plan must report `update` for
`DailyCap` with `physical_resource_id` `$QUOTA` (the id is kept).

- Only `limit` and `mode` (and `on_unpriced` on `cost_usd`) change in place.
  Another `scope`, `metric`, `window` or `meter_type` is a different quota:
  declare it under a new logical id.
- Checked **before** a generation starts; a generation in flight is never
  killed, so a budget can overshoot by at most one generation.
- Without a formation (only when the user asks): `PATCH …/quotas/{quota_id}`
  with `{ "mode": "enforce" }` (CLI `naturali update-quota` · SDK
  `naturali.quotas.updateQuota`).

## 5. Prove it blocks

Set `limit: 1` on `DailyCap`, apply it with `naturali-deploy-a-formation`, then
ask the agent for anything (full call in `naturali-run-a-generation`). Free: the
check refuses before the model is called and nothing is metered.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Say hello." }] }'
```

`429` instead of `202`, naming the quota that fired:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Quota exceeded for project.",
    "meta": {
      "quota_id": "quota_jTfCP8QSLQm3mGlw",
      "metric": "tokens",
      "limit": 1,
      "window": "rolling_24h",
      "resets_at": "2026-10-04T00:00:00.000Z"
    }
  }
}
```

- The `Retry-After` header (seconds, e.g. `49860`) lands on `meta.resets_at`;
  a client backs off by either without hard-coding the window.

Put `limit: 40000` back and apply it again.

Done when the generation at `limit: 1` answered `429 QUOTA_EXCEEDED` naming
`$QUOTA`, and the same call at `limit: 40000` is accepted (`202`,
`"status": "accepted"`).

## Next

- One quota caps one window. A `rolling_1h` quota beside the daily one is a
  burst brake (catches a runaway in minutes); a `calendar_month` one is the
  ceiling neither gives.
- A quota emits no webhook event. To hear before it fires, create a usage
  threshold below the cap (`POST …/usage/thresholds`, CLI
  `naturali create-project-usage-threshold`) and subscribe a webhook to
  `usage.threshold_crossed`.

## Related skills

- `naturali-cap-spend-per-end-user` — `scope: actor` gives every end user their own allowance instead of a pooled total.
- `naturali-enable-naturali-models` — managed models are priced, so a `cost_usd` cap works there.
- `naturali-deploy-a-formation` — validate, plan and apply each template change above.
- `naturali-run-a-generation` — the generation that proves the cap, in full.
