---
name: naturali-return-structured-output
description: Constrain a naturali.ai agent to a JSON Schema with output_schema so its generations return a validated object in output.object instead of prose. Use when asked for structured, JSON, typed or schema-validated output, to extract fields with an agent, when prose comes back after setting a schema, or on 502 OUTPUT_SCHEMA_VALIDATION_FAILED or a missing output.object.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/structured-output
---

# Return structured output

Outcome: an agent whose generations come back as a validated JSON object in
`output.object` — ready for code that expects fields, with no parsing.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `naturali.yaml` deployed as `$FORMATION`, with `Agent` in it and its id in
  `AGENT`, from `naturali-create-an-agent`.

Ids below are examples; use the ones your own calls return.

## 1. Attach a schema to the agent

`output_schema` is agent configuration, not a per-call argument: set it once
and every non-streaming generation of the agent is constrained to it. Change
the instructions in the same edit, since the schema now fixes the reply's
shape. Edit `Agent` in `naturali.yaml`:

```yaml
resources:
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id: { ref: Provider }
      instructions: You are a geography reference. Fill in the requested fields.  # changed
      output_schema:                                                              # added
        type: object
        properties:
          country: { type: string }
          capital: { type: string }
          population: { type: integer }
        required: [country, capital]
```

Apply it with `naturali-deploy-a-formation`. The plan reports one change:

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update",
                "physical_resource_id": "agent_wq7H4Ka1eDFVsBXM" }] }
```

- The agent keeps its id; the write archives a new configuration `version`.
- `required` is what makes a field reliable: a property the schema only
  allows may be absent from the object.
- Constraints beyond `type`/`required` (`enum`, `minLength`, `pattern`,
  `minItems`) are enforced too — use them to reject a structurally valid but
  degenerate answer.
- Without a formation (only when the user asks): `PATCH …/agents/{agent_id}`
  with `instructions` and `output_schema` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 2. Run a constrained generation

The request body is unchanged — the schema lives on the agent. Full options in
`naturali-run-a-generation`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
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
    "model": "nova-lite-v1",
    "content": "{\"country\":\"France\",\"capital\":\"Paris\"}",
    "finish_reason": "stop",
    "object": { "country": "France", "capital": "Paris" }
  }
}
```

- `output.object` is parsed and validated against the schema; a reply that
  breaks it fails the generation with `502 OUTPUT_SCHEMA_VALIDATION_FAILED`
  naming the field. `output.content` still carries the raw JSON.
- `wait=true` is what puts the object in this response; without it the call
  answers `202` with an id to poll.
- A streaming generation (`"stream": true`) is never constrained: Server-Sent
  Events, no `object`, no schema applied. Don't stream an agent whose object
  you need.
- One schema per agent: the generate route takes no `output_schema`, so two
  shapes means two agents. Set `output_schema: null` and apply to get prose
  back.
- A session turn is constrained too but returns message content, so the JSON
  arrives as text — fine for code that parses it, wrong for a human reading
  the thread; never bind such an agent to a channel.
- With tools, the schema applies to the last turn: tool calls and a
  constrained final answer compose.

Done when the generation is `completed` and `output.object` holds the schema's
required fields.

## Related skills

- `naturali-branch-an-orchestration` — a schema field, not a sentence, picks the agent that answers next.
- `naturali-run-tools-in-your-own-code` — client tool calls compose with a constrained final answer.
- `naturali-roll-out-an-agent-version` — ship a schema change to part of the traffic first.
