---
name: naturali-structured-output
description: Constrain a naturali.ai agent to a JSON Schema by adding output_schema to its formation template and updating the formation, so its generations return a validated object in output.object instead of prose. Use when asked for structured output, JSON output, a typed or schema-validated reply, extracting fields from an agent, setting output_schema on a naturali agent, or debugging OUTPUT_SCHEMA_VALIDATION_FAILED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/structured-output
---

# Structured output

Outcome: an agent whose generations come back as a validated JSON object
instead of prose — ready for code that expects fields, with no parsing.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT`, `PROVIDER`, `FORMATION`, `AGENT` and the `agent.yaml` template
  that deployed the agent, from `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Attach a schema to the agent

`output_schema` is agent configuration, not a per-call argument: set it once
and every non-streaming generation is constrained to it. Update the
instructions too, since the schema now fixes the reply's shape. Edit
`agent.yaml` so `Agent` reads:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: You are a geography reference. Fill in the requested fields.
      output_schema:
        type: object
        properties:
          country:
            type: string
          capital:
            type: string
          population:
            type: integer
        required: [country, capital]
```

Plan compares the edited template with what is deployed and creates nothing:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [{ "logical_id": "Agent", "action": "update", "physical_resource_id": "agent_wq7H4Ka1eDFVsBXM" }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -sS -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_wq7H4Ka1eDFVsBXM" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The update archived agent `version` 2; the agent keeps its id.
- Only `required` fields are reliable: an allowed-but-not-required property may
  be absent from the object.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` and `output_schema` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 2. Run a constrained generation

The request body is unchanged; the schema lives on the agent.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "action_id": "tutorial.structured-output",
        "messages": [{ "role": "user", "content": "Tell me about France." }]
      }'
```

```json
{
  "id": "gen_Rjmc7XiJedwRqwi5",
  "status": "completed",
  "output": {
    "content": "{\"country\":\"France\",\"capital\":\"Paris\"}",
    "finish_reason": "stop",
    "object": { "country": "France", "capital": "Paris" }
  }
}
```

- `output.object` is parsed and validated; a reply that breaks the schema fails
  the generation with `502 OUTPUT_SCHEMA_VALIDATION_FAILED` naming the field.
  `output.content` still carries the raw JSON.
- `wait=true` is what puts the object in the response; without it the call
  answers `202` with an id to poll.
- A streaming generation (`"stream": true`) is never constrained: no `object`,
  no schema. Don't stream an agent whose object you need.
- One schema per agent: the generate route takes no `output_schema`, so two
  shapes means two agents. Set `output_schema: null` in the template and update
  to get prose back.
- A session turn is constrained too but returns message content, so the JSON
  arrives as text — fine for code, wrong for a human (never bind such an agent
  to a channel).

Done when the generation is `completed` and `output.object` holds the schema's
required fields.

## Related skills

- `naturali-branch-an-orchestration` — a schema field decides which agent answers next.
- `naturali-run-tools-in-your-own-code` — tool calls compose with a constrained final answer.
- `naturali-roll-out-an-agent-version` — ship a schema change to part of the traffic first.
