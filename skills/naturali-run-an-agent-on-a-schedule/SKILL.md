---
name: naturali-run-an-agent-on-a-schedule
description: Declare a schedule trigger for an existing naturali.ai agent in a formation template and deploy it, prove it with one manual fire, trace the generation back to the trigger, read the firing log, and pause the schedule by editing the template. Use when asked to run an agent every morning, daily or hourly, schedule a naturali agent, create a cron or schedule trigger, fire a trigger by hand, check whether a scheduled run happened, or pause a schedule.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/run-an-agent-on-a-schedule
---

# Run an agent on a schedule

Outcome: an agent that runs on its own every morning — a `schedule` trigger
pointed at it, deployed from a formation, proven by one fire you start by hand
and a generation that names the trigger that started it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `AGENT` — a project and a working agent, from
  `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- Plan bounds, counted across the account's projects: at most **3** triggers
  on Free, **30** on Pro, **500** on Business; a schedule fires at most
  **hourly** on Free, every **5 minutes** on Pro, every **minute** on Business.
  Past either, the deploy answers `403 plan_limit_reached` — the bounds apply
  to a template too. Every firing is a generation and counts as a run against
  the plan.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create a schedule trigger

Declare the trigger in a template; the existing agent comes in as a parameter.
`cron` is 5 fields in **UTC**; `0 9 * * *` (daily 09:00) is allowed on every
plan. For an agent target, `input.message` becomes each run's user message.
Save as `schedule.yaml`:

```yaml
parameters:
  AgentId:
    type: string
resources:
  Trigger:
    type: trigger
    properties:
      name: morning-refund-reminder
      type: schedule
      cron: "0 9 * * *"
      target_type: agent
      target_id:
        param: AgentId
      input:
        message: Write today's one-line reminder of our refund window.
      active: true
outputs:
  trigger_id:
    ref: Trigger
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t schedule.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t schedule.yaml --arg a "$AGENT" \
        '{name: "morning-refund-reminder", template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "trigger_id": "trg_KipkvLcSYfHYNBmA" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The schedule is live from here (the trigger's `next_fire_at` is computed for
  you); nothing else runs on your side.
- A `cron` tighter than the plan allows (`*/15 * * * *` on Free) is refused
  before anything is created: `403` with `code: "plan_limit_reached"`,
  `details: { "plan": "free", "resource": "trigger_interval", "limit": 3600 }`.
- Only when the user asks for direct calls: `POST …/triggers` with the same
  properties as the body (CLI `naturali create-trigger` · SDK
  `naturali.triggers.createTrigger`).

```bash
export FORMATION=form_EPis15Nfukary167
export TRIGGER=trg_KipkvLcSYfHYNBmA
```

## 2. Fire it once by hand

Runs the same target with the same `input` now and answers with the finished
firing.

CLI `naturali fire-trigger` · SDK `naturali.triggers.fireTrigger`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/triggers/$TRIGGER/fire" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "trg_fire_WCXDKoYaTTSPY2vm",
  "source": "manual",
  "status": "succeeded",
  "result": { "target_type": "agent", "result_id": "gen_TcQ6rGwVeOXdXfqf", "status": "completed",
              "output": "Don't forget: You have 30 days from delivery to request a refund." },
  "error": null
}
```

- `result.result_id` is the generation the firing produced.
- A `failed` firing carries `error` instead — usually the agent's provider
  refusing the call.

```bash
export GENERATION=gen_TcQ6rGwVeOXdXfqf
```

## 3. Read the generation it produced

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "gen_TcQ6rGwVeOXdXfqf", "status": "completed", "stop_reason": "stop",
  "trigger_id": "trg_KipkvLcSYfHYNBmA", "agent_version": 1 }
```

`trigger_id` makes an unattended run traceable back to its schedule.

## 4. Read the firing log

Every firing — manual and scheduled — lands in one log per trigger.

CLI `naturali list-trigger-firings` · SDK `naturali.triggers.listTriggerFirings`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/trigger-firings?trigger_id=$TRIGGER" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "id": "trg_fire_WCXDKoYaTTSPY2vm", "source": "manual", "status": "succeeded",
             "result": { "target_type": "agent", "result_id": "gen_TcQ6rGwVeOXdXfqf", "status": "completed" } }],
  "total": 1
}
```

Done when the manual firing is `succeeded`, its generation carries
`trigger_id`, and after 09:00 UTC the log shows an entry with
`"source": "schedule"`.

## Pausing the schedule

`active: false` stops firings and keeps the trigger; `true` resumes it. Edit
`schedule.yaml`:

```yaml
      active: false
```

Review the diff, then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t schedule.yaml --arg f "$FORMATION" --arg a "$AGENT" \
        '{formation_id: $f, template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "changes": [{ "logical_id": "Trigger", "resource_type": "trigger", "action": "update",
  "diff": { "desired": { "active": false }, "current": { "active": true } } }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t schedule.yaml --arg a "$AGENT" \
        '{template: $t, parameters: {AgentId: $a}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "resources": [{ "logical_id": "Trigger", "status": "updated" }] }
```

- A negative credit balance also sets `active` to `false`, and nothing turns it
  back on for you.
- Only when the user asks for direct calls: `PATCH …/triggers/{trigger_id}`
  with `{ "active": false }` (CLI `naturali update-trigger` · SDK
  `naturali.triggers.updateTrigger`).

## Related skills

- `naturali-score-an-agent-change` — point a schedule at an eval to run a suite nightly.
- `naturali-debug-a-failed-run` — follow a `failed` firing's generation to the call that broke.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
