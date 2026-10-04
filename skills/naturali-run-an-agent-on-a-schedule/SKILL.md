---
name: naturali-run-an-agent-on-a-schedule
description: Put a naturali.ai agent on a cron schedule with a schedule trigger declared in the formation template, prove it with one fire by hand, trace the generation it produced back to the trigger, read the firing log, and pause the schedule. Use when asked to run an agent every morning, daily, hourly or nightly, create a cron or schedule trigger, fire a trigger by hand, check whether a scheduled run happened, pause or resume a schedule, find why a schedule went inactive, or debug 403 plan_limit_reached with resource trigger or trigger_interval.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/run-an-agent-on-a-schedule
---

# Run an agent on a schedule

Outcome: an agent that runs on its own every morning — a `schedule` trigger
pointed at it, proven by one fire you start by hand and a generation that names
the trigger that started it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml`, from `naturali-create-an-agent`, deployed as
  `$FORMATION` with `naturali-deploy-a-formation`.
- Plan bounds, counted across every project the account pays for: at most
  **3** triggers on Free, **30** on Pro, **500** on Business; a schedule fires
  at most **hourly** on Free, every **5 minutes** on Pro, every **minute** on
  Business. Every firing is a generation and counts as a run against the plan.

Ids below are examples; use the ones your own calls return.

## 1. Declare a schedule trigger

A trigger says what to run (`target_type` + `target_id`) and what starts it
(`type`). For `schedule`, `cron` is 5 fields in **UTC**: `0 9 * * *` is daily
at 09:00, which every plan allows. For an agent target, `input.message` becomes
the user message of each run. Add to `naturali.yaml`:

```yaml
resources:
  Schedule:
    type: trigger
    properties:
      name: morning-refund-reminder
      type: schedule
      cron: "0 9 * * *"
      target_type: agent
      target_id: { ref: Agent }
      input:
        message: Write today's one-line reminder of our refund window.
outputs:
  trigger_id: { ref: Schedule }
```

Apply it with `naturali-deploy-a-formation`; the plan reports
`{ "logical_id": "Schedule", "resource_type": "trigger", "action": "create" }`.

```bash
export TRIGGER=trg_KipkvLcSYfHYNBmA
```

- The schedule is live from here; the trigger's `next_fire_at` (read with CLI
  `naturali get-trigger` · SDK `naturali.triggers.getTrigger`) is computed for
  you, and nothing else runs on your side.
- Firings run as the caller who deployed the formation, confined so a firing
  never exceeds what that caller could do directly.
- `type` is immutable after creation.
- A `cron` tighter than the plan allows (`*/15 * * * *` on Free) is refused
  before anything is created — at validate, plan and deploy alike, with the
  declaration in `details.field`:

  ```json
  { "error": { "code": "plan_limit_reached",
      "message": "The free plan schedules a trigger at most once every hour.",
      "details": { "plan": "free", "resource": "trigger_interval", "limit": 3600 } } }
  ```

  The interval is the closest two firings, so `0 9,17 * * *` reads as eight
  hours. One trigger too many is `resource: "trigger"`. A `cron` that cannot be
  parsed is refused as `INVALID_CRON_EXPRESSION`.
- Without a formation (only when the user asks): `POST …/triggers` with the same
  properties and the agent's id as `target_id` (CLI `naturali create-trigger` ·
  SDK `naturali.triggers.createTrigger`).

## 2. Fire it once by hand

Waiting until 09:00 is a poor test. A fire runs the same target with the same
`input` now and answers with the finished firing.

CLI `naturali fire-trigger` · SDK `naturali.triggers.fireTrigger`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/triggers/$TRIGGER/fire" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "trg_fire_WCXDKoYaTTSPY2vm",
  "trigger_id": "trg_KipkvLcSYfHYNBmA",
  "source": "manual",
  "status": "succeeded",
  "input": { "message": "Write today's one-line reminder of our refund window." },
  "result": { "target_type": "agent", "result_id": "gen_TcQ6rGwVeOXdXfqf", "status": "completed",
              "output": "Don't forget: You have 30 days from delivery to request a refund." },
  "error": null
}
```

```bash
export GENERATION=gen_TcQ6rGwVeOXdXfqf
```

- `result.result_id` is the generation the firing produced. A `failed` firing
  carries `error` instead — usually the agent's provider refusing the call.
- A body `{ "input": { … } }` is shallow-merged over the trigger's static
  `input` for this fire only.
- A manual fire answers `402 insufficient_credit` and records no firing while
  the balance is negative, and `403 plan_limit_reached` (`resource: "runs"`)
  on a Free account past its monthly runs. Scheduled firings are not refused
  this way; see the pause section.

## 3. Read the generation it produced

An ordinary generation, with one difference: it names the trigger that started
it (full record in `naturali-read-a-run`).

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "gen_TcQ6rGwVeOXdXfqf", "agent_id": "agent_7VDoEY4pPnWYUyMV", "status": "completed",
  "stop_reason": "stop", "trigger_id": "trg_KipkvLcSYfHYNBmA", "agent_version": 1,
  "usage": { "cost_usd": 0.00000911, "input_tokens": 33, "output_tokens": 17 } }
```

`trigger_id` is what makes an unattended run traceable back to its schedule.

## 4. Read the firing log

Every firing — yours and the scheduler's — lands in one log per trigger;
`trigger_id` is required.

CLI `naturali list-trigger-firings` · SDK `naturali.triggers.listTriggerFirings`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/trigger-firings?trigger_id=$TRIGGER" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "id": "trg_fire_WCXDKoYaTTSPY2vm", "source": "manual", "status": "succeeded",
             "result": { "target_type": "agent", "result_id": "gen_TcQ6rGwVeOXdXfqf", "status": "completed" } }],
  "total": 1, "limit": 50, "offset": 0
}
```

Done when the manual firing is `succeeded`, its generation carries
`trigger_id`, and after 09:00 UTC the log holds an entry with
`"source": "schedule"` — the schedule running without you.

## Pause the schedule

`active: false` stops the firings and keeps the trigger and its log; `true`
resumes. Edit `Schedule` in `naturali.yaml`:

```yaml
resources:
  Schedule:
    type: trigger
    properties:
      name: morning-refund-reminder
      type: schedule
      cron: "0 9 * * *"
      target_type: agent
      target_id: { ref: Agent }
      input:
        message: Write today's one-line reminder of our refund window.
      active: false   # added
```

Apply it with `naturali-deploy-a-formation`; the plan reports `update` with
`diff: { "desired": { "active": false }, "current": { "active": true } }`.

- A negative credit balance also sets every schedule trigger the owner pays
  for to `active: false` (a zero balance does not), and nothing turns it back
  on for you. After a top-up, set `active: true` and apply again, or restore it
  from `GET /v1/users/me/stops` (CLI `naturali list-current-user-stops` · SDK
  `naturali.users.listCurrentUserStops`).
- Without a formation (only when the user asks): `PATCH …/triggers/{trigger_id}`
  with `{ "active": false }` (CLI `naturali update-trigger` · SDK
  `naturali.triggers.updateTrigger`).

## Related skills

- `naturali-read-a-run` — when a firing comes back `failed`, follow its generation down to the call that broke.
- `naturali-score-an-agent-change` — point a schedule at an eval (`target_type: eval`) to run a suite nightly.
- `naturali-orchestrate-several-agents` — a schedule can target an orchestration (`target_type: orchestration`).
- `naturali-cap-project-spend` — keep scheduled runs inside a budget.
