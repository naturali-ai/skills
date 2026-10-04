---
name: naturali-give-an-agent-long-term-memory
description: Give a naturali.ai agent long-term memory - declare a memory store and the agent's knowledge_config in its formation template and apply them with plan and update, declare a memory rule that extracts facts from every completed turn, and prove a fact told in one generation is used in a later, separate one. Use when asked to make a naturali agent remember users or customers across conversations, add persistent or long-term memory, create a memory store or memory rule, extract facts from conversations, or list what an agent has learned.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/give-an-agent-long-term-memory
---

# Give an agent long-term memory

Outcome: an agent that remembers what a customer told it — proven by a later,
separate generation that uses the fact without being told again.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` API key (or a session JWT).
- `PROJECT`, `PROVIDER`, `AGENT`, `FORMATION` and its template `agent.yaml` —
  a working agent deployed from a formation, from
  `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- Every fact is embedded on write, paid from credit on every plan. Memories
  count towards the account's storage allowance — about 4 kB each, whatever
  the text.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create a memory store

The scope the facts live in. One store per agent keeps what this agent learns
out of every other agent's answers. Add it to `agent.yaml` under `resources`, beside
`Agent`, and replace the `outputs` block:

```yaml
  Store:
    type: memory_store
    properties:
      name: customer-notes
      description: What customers tell the bakery agent about themselves.
outputs:
  agent_id:
    ref: Agent
  memory_store_id:
    ref: Store
```

Plan against the deployed formation (creates nothing), then apply:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [
  { "logical_id": "Agent", "resource_type": "agent", "action": "no-op" },
  { "logical_id": "Store", "resource_type": "memory_store", "action": "create" }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_e6iR8kjbMsGPbpMR", "memory_store_id": "mstore_EisX1nAWTwPPwPBd" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- `ProviderId` has no default, so every plan and update passes it again.
- Removing `Store` from the template later deletes it and its facts; set
  `deletion_policy: retain` on it to keep them.
- Only when the user asks for direct calls: `POST …/memory-stores` with `name`
  and `description` (CLI `naturali create-memory-store` · SDK
  `naturali.memoryStores.createMemoryStore`).

```bash
export STORE=mstore_EisX1nAWTwPPwPBd
```

## 2. Add a rule that learns from the agent

The rule reads every completed turn of the agents it names and writes the facts
it finds into the store. With no handler set, the built-in extractor reads —
one extra model call per turn.

Add it to `agent.yaml` under `resources`:

```yaml
  Rule:
    type: memory_rule
    properties:
      memory_store_id:
        ref: Store
      on: agents.generation.completed
      source_agent_ids:
        - ref: Agent
```

Plan and apply exactly as in step 1; the plan shows `Rule` as `create`.

- Only when the user asks for direct calls: `POST …/memory-rules` with
  `memory_store_id`, `on` and `source_agent_ids` (CLI `naturali
  create-memory-rule` · SDK `naturali.memoryRules.createMemoryRule`).
- The rule lives on the store: the agent gains no tool and its config does not
  change. A rule never fails the turn it reads.

## 3. Let the agent recall from the store

`memory_store_ids` in `knowledge_config` searches the store before every
generation, with the user's message as the query. Edit the `Agent` resource in
`agent.yaml`:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: You answer customers of a bakery. Use what you remember about the customer. Do not name products you were not told about. Answer in one sentence.
      knowledge_config:
        memory_store_ids:
          - ref: Store
        limit: 3
```

Plan and apply exactly as in step 1; the plan now shows `Agent` as `update` and
`Store` as `no-op`, and the agent is at `version` 2.

- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` and `knowledge_config` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 4. Tell the agent a fact

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Hi, I am Ana. Please note that I am allergic to almonds." }] }'
```

```json
{ "id": "gen_UZC1z4lf40BCLd2D", "status": "completed",
  "output": { "content": "Hello Ana, I have noted that you are allergic to almonds. …" } }
```

- The reply says "noted", but the agent wrote nothing; the rule reads the turn
  once it has completed.

## 5. See what it learned

Listing is always per store. Extraction runs after the turn: if the list is
empty, wait a few seconds and ask again.

CLI `naturali list-memories` · SDK `naturali.memories.listMemories`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/memories?memory_store_id=$STORE" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "id": "mem_3j1NM67SfBEEiruo", "content": "Ana is allergic to almonds.", "invalidated_at": null, "version": 1 }],
  "total": 1
}
```

- The same result is on step 4's generation
  (`GET /v1/projects/{project_id}/generations/{generation_id}`): `extraction`
  keyed by rule id (`{ "candidates": 1, "created": 1, "skipped": 0, "superseded": 0 }`)
  and `memory_assertions`, one row per write.

## 6. Ask in a new conversation

Only the new message is sent, and it does not mention almonds.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "This is Ana again. Is there anything I should avoid when I order?" }] }'
```

```json
{ "id": "gen_3G5L6BI3tZXkivzs", "status": "completed",
  "output": { "content": "Yes, you should avoid ordering anything that contains almonds." } }
```

- The rule keeps reading every turn, the agent's own replies included, so the
  store grows with what the agent says too. A near-duplicate is skipped, not
  stored twice.

Done when the second generation's `output.content` names the almond allergy —
a fact from a conversation it never saw.

## Related skills

- `naturali-answer-from-your-documents` — the same `knowledge_config`, fed by documents.
- `naturali-first-agent-generation` — create and run the agent this builds on.
