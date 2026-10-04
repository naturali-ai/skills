---
name: naturali-cap-project-spend
description: Put a token budget on a naturali.ai project — size it from the project's daily usage, declare a project-scope quota in monitor mode in a formation template and deploy it, check the audit log for quotas:MonitorBreach, switch it to enforce, and prove it refuses a generation with 429 QUOTA_EXCEEDED. Use when asked to cap, limit or budget a naturali project's spend or token usage, set a daily or monthly spend limit, create or enforce a quota, read project usage by day, or stop a runaway agent from spending.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/cap-project-spend
---

# Cap a project's spend

Outcome: a quota that stops your project from spending past a budget you chose
— sized against the project's own history, watched in `monitor` mode first,
then switched to `enforce` and verified to actually block.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key (or a session JWT), and
  `NATURALI_API=https://api.naturali.ai/v1` for the curl calls. Every step
  needs only the `member` role.
- `PROJECT` and `AGENT` — a working agent, from `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- Cap `tokens`, not `cost_usd`, unless every provider is managed: `cost_usd`
  sums priced cost, and only managed models are priced, so on your own
  provider the total is `0` and the cap never fires (a `quota_unpriced`
  exception is filed). `tokens` is always recorded.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Size the cap from real usage

`group_by=day` buckets the meter by calendar day; `meter_type=llm_tokens` keeps
storage and request meters out.

CLI `naturali get-project-usage` · SDK `naturali.projects.getProjectUsage`

```bash
curl -G "$NATURALI_API/projects/$PROJECT/usage" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d group_by=day \
  -d meter_type=llm_tokens \
  -d from=2026-07-01T00:00:00Z
```

```json
{
  "cost_usd": 0.509007895,
  "total_tokens": 21236,
  "groups": {
    "data": [
      { "key": "2026-10-02", "total_tokens": 3108 },
      { "key": "2026-10-01", "total_tokens": 12050 }
    ],
    "total": 5, "limit": 50, "offset": 0
  }
}
```

- Take the busiest day's `total_tokens`, not the average. Days are not in date
  order; compare them all. `groups` is paged: page with `offset` past `limit`.
- Cap at about 3× the busiest day: 12,050 → 40,000.
- `cost_usd` is `null` on a project using only your own provider — a
  `cost_usd` quota there would be dead on arrival.
- A token cap is not a dollar cap: re-check it whenever an agent's `model`
  changes; reasoning tokens count as output tokens.

## 2. Declare the quota in monitor mode

`mode: monitor` aggregates and reports exactly as `enforce` does, then lets the
work through. `scope: project` with no `scope_ref` is the whole project pooled.
Save as `quota.yaml`:

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
  quota_id:
    ref: DailyCap
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t quota.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t quota.yaml '{name: "project-spend-cap", template: $t}')"
```

```json
{ "id": "form_Lc8hV2qZr5NwX1tJ", "status": "active", "error": null,
  "outputs": { "quota_id": "quota_jTfCP8QSLQm3mGlw" } }
```

```bash
export FORMATION=form_Lc8hV2qZr5NwX1tJ
export QUOTA=quota_jTfCP8QSLQm3mGlw
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Identity is `scope`, `scope_ref`, `metric`, `window`, `meter_type`; a second
  quota with the same five → `409 QUOTA_CONFLICT`.
- `current_usage` on the quota is null for token quotas by design; only
  `requests` quotas carry one.
- A new quota counts history, so it can be born breached. After an incident,
  wait out the window (24 hours, or the 1st of the month for
  `calendar_month`) before enforcing.
- Only when the user asks for direct calls: `POST …/quotas` with the same
  properties as the body (CLI `naturali create-quota` · SDK
  `naturali.quotas.createQuota`).

## 3. Watch what would have breached

A monitor-mode breach writes one `quotas:MonitorBreach` audit entry per window.
Give it a window of real traffic, then look:

CLI `naturali list-audit-entries` · SDK `naturali.auditLog.listAuditEntries`

```bash
curl -G "$NATURALI_API/projects/$PROJECT/audit-log" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d action=quotas:MonitorBreach
```

```json
{ "data": [{ "action": "quotas:MonitorBreach", "resource_public_id": "quota_jTfCP8QSLQm3mGlw",
  "created_at": "2026-08-31T09:41:02.000Z" }], "next_cursor": null }
```

- Empty list = good: enforcing will not interrupt anyone. Entries = limit too
  low; raise it and watch another window.
- The audit log is included from the Business plan. Below it this answers
  `403` `plan_feature_not_included`; instead re-run step 1 at each window's end
  and compare the busiest day to the limit.

## 4. Switch it to enforce

`limit` and `mode` are the only updatable fields; changing `scope`, `metric` or
`window` means a different quota. In `quota.yaml`:

```yaml
      mode: enforce
```

Plan the change (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t quota.yaml --arg f "$FORMATION" '{formation_id: $f, template: $t}')"
```

```json
{ "changes": [{ "logical_id": "DailyCap", "resource_type": "quota", "action": "update",
  "physical_resource_id": "quota_jTfCP8QSLQm3mGlw" }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t quota.yaml '{template: $t}')"
```

```json
{ "id": "form_Lc8hV2qZr5NwX1tJ", "status": "active", "error": null,
  "outputs": { "quota_id": "quota_jTfCP8QSLQm3mGlw" } }
```

- The plan must say `update`: the quota keeps its id.
- Checked before a generation starts; one already in flight is never killed,
  so a budget can overshoot by at most one generation.
- Only when the user asks for direct calls: `PATCH …/quotas/{quota_id}` with
  `{ "mode": "enforce" }` (CLI `naturali update-quota` · SDK
  `naturali.quotas.updateQuota`).

## 5. Prove it blocks

Set `limit: 1` in `quota.yaml`, watch a generation be refused, then put it
back. This costs nothing: nothing is metered for a refused generation. Plan as
in step 4, then apply:

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t quota.yaml '{template: $t}')"
```

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Say hello." }] }'
```

`429`, with a `Retry-After` header in seconds that lands on `meta.resets_at`:

```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Quota exceeded for project.",
  "meta": { "quota_id": "quota_jTfCP8QSLQm3mGlw", "metric": "tokens", "limit": 1,
            "window": "rolling_24h", "resets_at": "2026-10-04T00:00:00.000Z" } } }
```

Put `limit: 40000` back in `quota.yaml` and apply it with the same
`PUT …/formations/{formation_id}` call.

- Only when the user asks for direct calls: `PATCH …/quotas/{quota_id}` with
  `{ "limit": 1 }`, then `{ "limit": 40000 }` (CLI `naturali update-quota` ·
  SDK `naturali.quotas.updateQuota`).

Done when the generation at `limit: 1` answered `429 QUOTA_EXCEEDED` naming
`$QUOTA`, and the same call at `limit: 40000` is accepted again (`202`,
`"status": "accepted"`).

## Related skills

- `naturali-cap-spend-per-end-user` — `scope: actor` with a null `scope_ref` gives every end user their own allowance.
- `naturali-enable-naturali-models` — managed models are priced, so a `cost_usd` cap works.
- `naturali-create-a-provider` — on your own provider, set price overrides before capping dollars.
