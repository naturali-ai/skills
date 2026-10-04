---
name: naturali-formations
description: Declare a naturali.ai agentic system as one formation template and validate, plan, deploy, update, inspect and tear it down. The default way to create any naturali resource - agents, tools, providers, knowledge, memory, channels, guardrails, evals, orchestrations, workflows, triggers, quotas. Use whenever a task creates or changes naturali resources, mentions a formation, template, stack or infrastructure as code, or asks to deploy, plan, diff or roll back a naturali setup.
license: Apache-2.0
metadata:
  author: naturali.ai
  docs: https://docs.naturali.ai/docs/modules/formations
---

# Formations

A formation is a whole system declared in one YAML template and deployed as one
unit. Resources name each other by logical id, so ordering and id plumbing are
derived. Updating the formation with an edited template converges the project
on it; deleting the formation deletes what it created.

**Build with a formation unless the user asks for direct calls.** Actions that
are not state (generate, fire a trigger, approve, upload file bytes, start an
eval run) are always direct calls. Each capability skill (`naturali-agents`,
`naturali-tools`, …) documents its resource types' properties and those actions.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
  A project is not declarable: create it with `POST /v1/projects`.
- `jq`, to put the template file into a JSON body.

Every call below is also a CLI command and an SDK method, named above it.

## The template

```yaml
parameters:              # optional; type is always string
  ProviderId:
    type: string
  ApiToken:
    type: string
    no_echo: true        # credentials: never inline them
resources:               # the only required block
  Lookup:
    type: tool
    properties:
      name: lookup-order
      type: http
      description: Looks up an order by its id.
      parameters:
        type: object
        properties: { order_id: { type: string } }
        required: [order_id]
      execute:
        url: https://api.example.com/orders/{order_id}
        method: GET
        headers:
          Authorization:
            sub: 'Bearer ${ApiToken}'
  Support:
    type: agent
    properties:
      name: support
      ai_provider_id:
        param: ProviderId
      instructions: Look the order up before answering.
      tool_bindings:
        - tool_id:
            ref: Lookup
outputs:
  agent_id:
    ref: Support
```

| Expression | Resolves to |
| --- | --- |
| `{ ref: LogicalId }` | the resource's id once created; also declares the dependency |
| `{ param: Name }` | a parameter's value |
| `{ sub: 'text ${Name}' }` | a string with parameters interpolated |
| `{ ref_attr: LogicalId.attribute }` | a named attribute (outputs only; a trigger's `secret` is refused) |

Per resource, beside `type` and `properties`:

- `depends_on: [LogicalId]` — ordering a `ref` does not express.
- `deletion_policy: retain` — removing it from the template (or deleting the
  formation) keeps the resource. Default `delete`; an explicit `null` is refused.
- `metadata` — free-form annotations.

`properties` are validated against the type's `<Type>ResourceProperties`
schema in `https://naturali.ai/openapi.json`; unknown keys are refused. A
parameter without `default` must be sent on every create, plan and update
(`use_previous_value: true` reuses the stored value on update).

### Resource types

| Type | Skill |
| --- | --- |
| `naturali_ai_provider`, `ai_provider`, `secret`, `model_route` | `naturali-model-providers` |
| `agent` | `naturali-agents` |
| `tool` | `naturali-tools` |
| `file`, `document`, `ingestion_rule`, `metadata_schema` | `naturali-knowledge` |
| `memory_store`, `memory_rule`, `memory` | `naturali-memory` |
| `session`, `conversation`, `actor` | `naturali-sessions` |
| `channel` | `naturali-channels` |
| `guardrail` | `naturali-governance` |
| `dataset`, `dataset_item`, `eval` | `naturali-evals` |
| `orchestration`, `decider` | `naturali-orchestrations` |
| `workflow` | `naturali-workflows` |
| `trigger` | `naturali-triggers` |
| `quota` | `naturali-spend` |

Anything else answers `400 unsupported_resource_type`, including `api_key`,
`chat`, `policy`, `project_price` and `webhook`. Plan limits apply to a template
as to the routes: a feature outside the plan is `403
plan_feature_not_included`; too many channels or triggers, or a too-tight
trigger interval, is `403 plan_limit_reached` with the declaration in
`details.field`.

## Validate

Parses and type-checks; creates nothing.

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t stack.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

## Deploy

Creates every resource in dependency order and answers once they exist; a
failure rolls the whole deploy back. `name` is unique per project (`409` on
reuse).

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t stack.yaml --arg p "$PROVIDER" --arg k "$API_TOKEN" \
        '{name: "support-stack", template: $t, parameters: {ProviderId: $p, ApiToken: $k}}')"
```

```json
{
  "id": "form_EPis15Nfukary167",
  "status": "active",
  "error": null,
  "outputs": { "agent_id": "agent_EmeXFnXV6RRtFHvp" },
  "resources": [
    { "logical_id": "Lookup", "resource_type": "tool", "physical_resource_id": "tool_8Vfntfb4p4z2goON", "status": "created" },
    { "logical_id": "Support", "resource_type": "agent", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp", "status": "created" }
  ]
}
```

```bash
export FORMATION=form_EPis15Nfukary167
export AGENT=agent_EmeXFnXV6RRtFHvp
```

- Read `error` as well as `status`. An `active` formation with
  `FORMATION_REPLACE_CLEANUP_FAILED` applied the change but could not delete a
  superseded resource (`error.meta.failures`); it is retried on the next deploy.
- Every `physical_resource_id` is an ordinary resource, readable and callable
  through its own module.

## Change it: plan, then update

Edit the template, then diff it against what is deployed (creates nothing):

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t stack.yaml --arg f "$FORMATION" --arg p "$PROVIDER" --arg k "$API_TOKEN" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p, ApiToken: $k}}')"
```

```json
{ "changes": [
  { "logical_id": "Lookup", "resource_type": "tool", "action": "no-op" },
  { "logical_id": "Support", "resource_type": "agent", "action": "update",
    "diff": { "desired": { "instructions": "…" }, "current": { "instructions": "…" } } } ] }
```

`action` is `create`, `update`, `replace`, `delete` or `no-op`. `update` keeps
the id (an agent update archives a new version); `replace` creates a new
resource and re-points every `ref` to it; `delete` means a resource left the
template. Without `formation_id`, plan shows what a fresh deploy would create.

Apply:

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t stack.yaml --arg p "$PROVIDER" --arg k "$API_TOKEN" \
        '{template: $t, parameters: {ProviderId: $p, ApiToken: $k}}')"
```

- A write-only credential (a channel's `bot_token`, `access_token`, `code`)
  always reads as changed, so every update re-sends it — keep it in a
  `no_echo` parameter.

## Inspect

CLI `naturali get-formation` · SDK `naturali.formations.getFormation`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

The deploy log — every create, update and teardown, and for a failure which
resource broke it (`action` includes `rollback`):

CLI `naturali list-formation-events` · SDK `naturali.formations.listFormationEvents`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION/events?limit=10" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

List the project's formations: CLI `naturali list-formations` · SDK
`naturali.formations.listFormations` · `GET …/formations`.

## Tear down

CLI `naturali delete-formation` · SDK `naturali.formations.deleteFormation`

```bash
curl -X DELETE "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- An agent that has run blocks the teardown with `409 FORMATION_DELETE_FAILED`
  and nothing is deleted. Force-delete it first (CLI `naturali delete-agent
  --force true` · `DELETE …/agents/{agent_id}?force=true`), which also removes
  its generations and traces.
- `retain` resources survive; a managed provider is force-deleted, its metered
  spend kept.

## Related skills

- `naturali` — authentication, errors and the API at a glance.
- `naturali-model-providers` — the provider almost every template starts from.
- `naturali-agents` — the resource most templates exist to deploy.
