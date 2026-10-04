---
name: naturali-deploy-a-formation
description: Apply a naturali.ai formation template (naturali.yaml) - write it (parameters, resources, outputs, ref/param/sub/ref_attr expressions, depends_on, deletion_policy, no_echo and use_previous_value parameters), validate it, deploy it, plan and apply changes, read its status and deploy log, and tear it down. Every other naturali skill that creates or changes a resource defers here for these calls. Use when asked to deploy, apply, plan, diff, update, inspect, roll back or delete a naturali formation, stack, template or infrastructure as code, or when a deploy answers unsupported_resource_type, VALIDATION_FAILED, status failed, FORMATION_REPLACE_CLEANUP_FAILED, FORMATION_DELETE_FAILED, FORMATION_INVALID_METADATA, plan_feature_not_included or plan_limit_reached.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/deploy-a-system-from-a-template
---

# Deploy a formation

Outcome: the system declared in `naturali.yaml` exists in the project as one
formation, changed by editing the file and torn down in one call.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id,
  from `naturali-create-a-project`.
- `naturali.yaml` — the template; the other skills add resources to it.
- `jq`, to put the YAML file into the JSON body.

Ids below are examples; use the ones your own calls return.

## 1. Write the template

```yaml
parameters:                  # optional; type is always string
  ApiToken:
    type: string
    no_echo: true            # masked as *** in resolved_parameters
    use_previous_value: true # an update may omit it and reuse the stored value
  Env:
    type: string
    default: prod            # no default = must be sent on create, plan and update
resources:                   # the only required block
  Provider:
    type: naturali_ai_provider
    properties:
      name: naturali
      default_model: nova-lite-v1
  Token:
    type: secret
    deletion_policy: retain  # survives removal and teardown; default delete, explicit null refused
    properties:
      name: orders-api-token
      value:
        param: ApiToken
  Agent:
    type: agent
    depends_on: [Token]      # ordering a ref does not already express
    properties:
      name:
        sub: 'support-${Env}'
      ai_provider_id:
        ref: Provider
      instructions: Answer in one sentence. If you are unsure, say so.
outputs:
  agent_id:
    ref: Agent
```

| Expression | Resolves to |
| --- | --- |
| `{ ref: LogicalId }` | that resource's id once created; also declares the dependency, so order is derived |
| `{ param: Name }` | a parameter's value |
| `{ sub: 'text ${Name}' }` | the string with parameters interpolated |
| `{ ref_attr: LogicalId.attribute }` | a named attribute of a created resource, in `outputs`; a trigger's `secret` is refused (`400 VALIDATION_FAILED`) |

- `properties` must match the type's `<Type>ResourceProperties` schema in
  https://naturali.ai/openapi.json; unknown keys are refused.
- Declarable types: `actor`, `agent`, `ai_provider`, `naturali_ai_provider`,
  `channel`, `conversation`, `dataset`, `dataset_item`, `decider`, `document`,
  `eval`, `file`, `guardrail`, `ingestion_rule`, `memory`, `memory_rule`,
  `memory_store`, `metadata_schema`, `model_route`, `orchestration`, `quota`,
  `secret`, `session`, `tool`, `trigger`, `workflow`. Anything else (`api_key`,
  `chat`, `policy`, `project_price`, `webhook`) is `400
  unsupported_resource_type`. A project is not declarable.
- Credentials go in `no_echo` parameters, never inline. A channel's
  `bot_token`/`access_token`/`code` is write-only, so it always reads as
  changed and every update re-sends it.
- A per-resource `metadata` bag is free-form. A top-level template `metadata`
  block takes `ref`/`param`/`sub` and is resolved into `resolved_metadata`.
- Plan limits apply to declarations, on validate too: `403
  plan_feature_not_included`, or `403 plan_limit_reached` (channels, triggers,
  trigger interval) with the declaration in `details.field`.

## 2. Validate

Parses and type-checks; creates nothing. Send `parameters` to also report
required ones still missing.

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t naturali.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

Each entry in `errors` has a `path` and a `message`.

## 3. Deploy (first time only)

Creates every resource in dependency order and answers once they exist.
Parameters are a flat map of strings (CLI `--parameters '{"ApiToken":"…"}'`).

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t naturali.yaml --arg k "$API_TOKEN" \
        '{name: "support-stack", template: $t, parameters: {ApiToken: $k}}')"
```

```json
{
  "id": "form_EPis15Nfukary167",
  "name": "support-stack",
  "status": "active",
  "error": null,
  "outputs": { "agent_id": "agent_EmeXFnXV6RRtFHvp" },
  "resources": [
    { "logical_id": "Provider", "resource_type": "naturali_ai_provider", "physical_resource_id": "aip_eHPAQ6qpUkB70D3N", "status": "created" },
    { "logical_id": "Token", "resource_type": "secret", "physical_resource_id": "sec_l4gKTvGnouZ68huG", "status": "created" },
    { "logical_id": "Agent", "resource_type": "agent", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp", "status": "created" }
  ]
}
```

```bash
export FORMATION=form_EPis15Nfukary167
export AGENT=agent_EmeXFnXV6RRtFHvp     # read each id you need from outputs
```

- Read `status`, not the HTTP code. A bad template shape is `400`; a failed
  deploy is still `201` with `status: "failed"` and `error` (`code`,
  `message`, `meta.logical_id`), and everything it created is rolled back. The
  CLI exits non-zero on that body.
- `name` is unique per project: reuse is `409`. Once the formation exists,
  every later change is step 4, not a second create.
- `403` with `error.meta.denied_actions`: the caller lacks an action a declared
  resource needs; nothing is applied.
- Every `physical_resource_id` is an ordinary resource, read and called through
  its own module.
- The formation's own `metadata` field (on create/update) is static: an
  expression there is `400 FORMATION_INVALID_METADATA`.

## 4. Change it: plan, then update

Edit `naturali.yaml`, then diff it against what is deployed (creates nothing).
Without `formation_id`, plan shows what a fresh deploy would create.

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t naturali.yaml --arg f "$FORMATION" \
        '{formation_id: $f, template: $t}')"
```

```json
{
  "changes": [
    { "logical_id": "Provider", "resource_type": "naturali_ai_provider", "action": "no-op", "physical_resource_id": "aip_eHPAQ6qpUkB70D3N" },
    { "logical_id": "Agent", "resource_type": "agent", "action": "update", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp",
      "diff": { "desired": { "instructions": "…new…" }, "current": { "instructions": "…old…" } } }
  ]
}
```

- `action` is `create`, `update` (keeps the id; an agent update archives a new
  version), `delete` (the resource left the template and will really be
  deleted unless it is `retain`) or `no-op`. `diff` carries the unchanged
  properties too.
- A change that cannot be made in place (a `naturali_ai_provider` moved to a
  model of another source) creates a new resource and re-points every `ref`.
- `unauthorized_actions`, when present, lists what the caller may not do; the
  update would be refused until it is empty.

Apply:

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -sS -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t naturali.yaml '{template: $t}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "resources": [{ "logical_id": "Agent", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp", "status": "updated" }] }
```

- Plan and update need every parameter without a default again (add
  `parameters` as in step 3), except those declared `use_previous_value: true`.
- A failed update is `200` with `status: "failed"`. `status: "active"` with
  `error.code: "FORMATION_REPLACE_CLEANUP_FAILED"` applied the change but could
  not delete a superseded resource (`error.meta.failures`); the next deploy
  retries. Check `error` as well as `status`.

## 5. Inspect

CLI `naturali get-formation` · SDK `naturali.formations.getFormation`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

Returns `status`, `outputs`, `resources`, `error` and `resolved_parameters`; a
`secret`'s `value` reads back as `{ "no_echo": true }`.

The deploy log — each create, update and delete operation with its events:

CLI `naturali list-formation-events` · SDK `naturali.formations.listFormationEvents`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION/events?limit=10" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [{ "operation_type": "update", "status": "failed",
    "error": { "code": "VALIDATION_FAILED", "meta": { "logical_id": "Agent", "resource_type": "agent" } },
    "events": [{ "logical_id": "Provider", "action": "rollback", "status": "succeeded" }] }],
  "total": 3, "limit": 10, "offset": 0 }
```

Event `action` is `create`, `update`, `delete`, `no-op`, `rollback` or
`rollback-skipped` (a `retain` resource left standing). List the project's
formations: CLI `naturali list-formations` · `GET …/formations`.

## 6. Tear down

Deletes everything the formation created, in reverse dependency order, except
`retain` resources. An agent that has run blocks it with `409
FORMATION_DELETE_FAILED` (`error.meta.failures`), found before anything is
deleted, so the formation stays `active`. Force-delete such agents first — this
also deletes their generations and traces:

CLI `naturali delete-agent --force true` · SDK `naturali.agents.deleteAgent`

```bash
curl -sS -X DELETE "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT?force=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

CLI `naturali delete-formation` · SDK `naturali.formations.deleteFormation`

```bash
curl -sS -X DELETE "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "success": true }
```

- A blocker found mid-teardown leaves the formation `delete_failed`, with what
  was deleted before it gone; the `message` says which case happened.
- A managed provider is force-deleted; its metered spend is kept.

Done when the deploy or update answers `status: "active"` with `error: null`
and `outputs` holds the ids you need.

## Related skills

- `naturali-create-a-project` — the project a formation deploys into.
- `naturali-enable-naturali-models` — the `Provider` most templates start from.
- `naturali-create-an-agent` — the `Agent` most templates exist to deploy.
- `naturali-run-a-generation` — run a deployed agent.
