---
name: naturali-deploy-a-system-from-a-template
description: Declare a managed model provider, an http tool and the agent that calls it in one naturali.ai formation template, validate and deploy it with one call, plan and apply a change in place, and tear it down. Use when asked to deploy infrastructure as code on naturali, write or validate a formation template in YAML, create a formation or stack, plan or diff a template change, update a deployed formation, or delete a formation and what it created.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/deploy-a-system-from-a-template
---

# Deploy a system from a template

Outcome: a small agentic system — a managed model provider, an order-lookup
tool and a support agent that calls it — declared in one formation template,
deployed with one call, and changed in place by editing the template.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key (or a session JWT).
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT` — a project, as in `naturali-first-agent-generation`. The template
  brings its own provider, so no `PROVIDER` is needed.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Write and validate the template

Save as `stack.yaml`. `ref` stands in for an id that does not exist yet, so
the agent names its provider and tool before either is created. The tool calls
`httpbin.org`, which echoes the request — in your system, your order API.

```yaml
resources:
  Models:
    type: naturali_ai_provider
    properties:
      name: stack-models
      default_model: glm-4.7-flash
  OrderLookup:
    type: tool
    properties:
      name: lookup-order
      type: http
      description: Looks up an order by its id.
      parameters:
        type: object
        properties:
          order_id:
            type: string
        required:
          - order_id
      execute:
        url: https://httpbin.org/anything/orders/{order_id}
        method: GET
  Support:
    type: agent
    properties:
      name: stack-support
      ai_provider_id:
        ref: Models
      instructions: >-
        You answer questions about orders. Look the order up with
        lookup-order before answering, and say which URL you checked.
      tool_bindings:
        - tool_id:
            ref: OrderLookup
outputs:
  agent_id:
    ref: Support
```

Validate parses and type-checks the template and creates nothing.

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t stack.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

- A template may only declare the resource types this API serves; `api_key`,
  `policy` or `webhook` answer `400 unsupported_resource_type`.

## 2. Deploy it

Creates the three resources in dependency order and answers once they exist.

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t stack.yaml '{name: "support-stack", template: $t}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_EmeXFnXV6RRtFHvp" },
  "resources": [{ "logical_id": "Models", "physical_resource_id": "aip_eHPAQ6qpUkB70D3N", "status": "created" }, …] }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Each `resources[].physical_resource_id` is an ordinary resource, readable
  through its own module.

```bash
export FORMATION=form_EPis15Nfukary167
export AGENT=agent_EmeXFnXV6RRtFHvp
```

## 3. Run the deployed agent

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [{ "role": "user", "content": "Where is order 1001?" }] }'
```

```json
{ "id": "gen_xNbNEQalLzlMvTkm", "status": "completed", "ai_provider_id": "aip_eHPAQ6qpUkB70D3N",
  "output": { "content": "I checked the order at URL: https://httpbin.org/anything/orders/1001\n\nUnfortunately, the lookup returned an empty data response, …" } }
```

`ai_provider_id` is the `Models` resource and the reply names the URL the tool
called: every declared piece took part. The echo carries no order data, so the
agent guesses why.

## 4. Plan a change

Edit `stack.yaml` so `Support` reads:

```yaml
Support:
  type: agent
  properties:
    name: stack-support
    ai_provider_id:
      ref: Models
    instructions: >-
      You answer questions about orders. Look the order up with
      lookup-order before answering, and say which URL you checked.
      If the lookup returns no order data, say the order is still
      being processed and will update within a day.
    tool_bindings:
      - tool_id:
          ref: OrderLookup
```

Plan compares the edited template against what is deployed and creates
nothing.

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t stack.yaml --arg f "$FORMATION" \
        '{formation_id: $f, template: $t}')"
```

```json
{
  "changes": [
    { "logical_id": "Models", "action": "no-op" },
    { "logical_id": "OrderLookup", "action": "no-op" },
    { "logical_id": "Support", "action": "update", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp",
      "diff": { "desired": { "instructions": "… If the lookup returns no order data, say the order is still being processed and will update within a day." },
                "current": { "instructions": "… and say which URL you checked." } } }
  ]
}
```

One `update`, two `no-op`s: the agent changes in place and keeps its id.

## 5. Apply it

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -sS -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t stack.yaml '{template: $t}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active",
  "resources": [
    { "logical_id": "Models", "status": "created" },
    { "logical_id": "OrderLookup", "status": "created" },
    { "logical_id": "Support", "physical_resource_id": "agent_EmeXFnXV6RRtFHvp", "status": "updated" } ] }
```

Same agent id, now `updated`; the write archived a version, so the agent is at
`version` 2.

## 6. Run the agent again

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [{ "role": "user", "content": "Where is order 1001?" }] }'
```

```json
{ "id": "gen_W1OWLuDVtAd66lFN", "status": "completed",
  "output": { "content": "I checked https://httpbin.org/anything/orders/1001, … it appears that order 1001 is still being processed. The order should update within a day. …" } }
```

Done when the second generation is `completed` and its answer follows the new
instructions, from the same agent id the formation created.

## Clean up

Deleting the formation deletes everything it created — except an agent that
has run: the teardown answers `409 FORMATION_DELETE_FAILED` and deletes
nothing. Force-delete the agent first (that removes its history too), then the
formation. To keep a resource when its formation goes, set
`deletion_policy: retain` on it in the template.

CLI `naturali delete-agent` · SDK `naturali.agents.deleteAgent`

```bash
curl -sS -X DELETE "$NATURALI_API/projects/$PROJECT/agents/$AGENT?force=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

CLI `naturali delete-formation` · SDK `naturali.formations.deleteFormation`

```bash
curl -sS -X DELETE "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "success": true }
```

## Related skills

- `naturali-run-an-agent-on-a-schedule` — a `trigger` resource declares the same schedule; plan limits on triggers apply to a template too.
- `naturali-roll-out-an-agent-version` — serve a changed agent to part of the traffic before every caller gets it.
