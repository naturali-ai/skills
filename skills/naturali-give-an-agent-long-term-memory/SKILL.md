---
name: naturali-give-an-agent-long-term-memory
description: Give a naturali.ai agent long-term memory - a memory store, a memory rule that extracts facts from every completed turn, and recall through knowledge_config.memory_store_ids. Use when asked to make an agent remember users or customers across conversations, add persistent memory, learn facts from conversations automatically, create a memory store or memory rule, or check what an agent has learned.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/give-an-agent-long-term-memory
---

# Give an agent long-term memory

Outcome: an agent that remembers what a customer told it — the platform
extracts facts after each turn into a store, and the agent recalls them in
later conversations that never contained them.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml`, from `naturali-create-an-agent`, and `AGENT`
  exported. Use your template's logical id if it differs.
- Every fact is embedded on write, paid from credit on every plan, and counts
  about 4 kB towards the account's storage whatever its length. The built-in
  extractor is one extra model call per turn.

Ids below are examples; use the ones your own calls return.

## 1. Declare the store, the rule and recall

Add `Store` and `Learn`, and edit `Agent`, in `naturali.yaml`:

```yaml
resources:
  Store:
    type: memory_store
    properties:
      name: customer-notes
      description: What customers tell the bakery agent about themselves.
  Learn:
    type: memory_rule
    properties:
      memory_store_id: { ref: Store }
      on: agents.generation.completed
      source_agent_ids:
        - ref: Agent
  Agent:
    type: agent
    properties:
      name: support
      ai_provider_id: { ref: Provider }
      instructions: You answer customers of a bakery. Use what you remember about the customer. Do not name products you were not told about. Answer in one sentence.   # changed
      knowledge_config:            # added
        memory_store_ids:
          - ref: Store
        limit: 3
outputs:
  memory_store_id: { ref: Store }
  memory_rule_id: { ref: Learn }
```

Apply it with `naturali-deploy-a-formation`; the plan creates `Store` and
`Learn` and updates `Agent`. Then:

```bash
export STORE=mstore_EisX1nAWTwPPwPBd   # outputs.memory_store_id
```

- A store is a scope. One store per agent keeps what this agent learns out of
  every other agent's answers; one per customer keeps one customer's facts out
  of another's.
- The rule reads every completed turn of the agents in `source_agent_ids`
  (`null` or omitted = every agent in the project). With no `agent_id` or
  `tool_id` handler, the built-in extractor reads the turn; `prompt`, `model`
  and `ai_provider_id` tune it. The built-in extractor binds only to
  `agents.generation.completed`; `conversations.message.generated` is for
  custom handlers.
- The rule lives on the store: the agent gains no tool. A rule never fails or
  blocks the turn it reads.
- `memory_store_ids` searches the store before every generation, with the
  user's message as the query. Writing without it stores facts the agent never
  reads back.
- Store tuning: `duplicate_threshold` (default 0.95, a near-duplicate is
  skipped) and `supersede_threshold` (default 0.90, a changed fact retires the
  old one); the second must stay below the first.
- Without a formation (only when the user asks): `POST …/memory-stores`
  (CLI `naturali create-memory-store` · SDK `naturali.memoryStores.createMemoryStore`),
  `POST …/memory-rules` with `memory_store_id`, `on`, `source_agent_ids`
  (CLI `naturali create-memory-rule` · SDK `naturali.memoryRules.createMemoryRule`),
  `PATCH …/agents/$AGENT` with `knowledge_config` (CLI `naturali patch-agent` ·
  SDK `naturali.agents.patchAgent`).

## 2. Tell the agent a fact

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Hi, I am Ana. Please note that I am allergic to almonds." }] }'
```

```json
{
  "id": "gen_UZC1z4lf40BCLd2D",
  "status": "completed",
  "output": { "content": "Hello Ana, I have noted that you are allergic to almonds. How can I assist you with your order today?" }
}
```

```bash
export GENERATION=gen_UZC1z4lf40BCLd2D
```

The reply says "noted", but the agent wrote nothing: the rule reads the turn
once it has completed.

## 3. See what it learned

CLI `naturali list-memories` · SDK `naturali.memories.listMemories`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/memories?memory_store_id=$STORE" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "mem_3j1NM67SfBEEiruo", "memory_store_id": "mstore_EisX1nAWTwPPwPBd",
      "content": "Ana is allergic to almonds.", "invalidated_at": null, "version": 1 }
  ],
  "total": 1
}
```

- Extraction runs after the turn: if the list is empty, wait a few seconds and
  ask again.
- Listing always takes `memory_store_id`; there is no cross-store listing.
  `include_invalidated=true` adds superseded and retracted facts.
- The same result is on the turn: `GET …/generations/$GENERATION` (CLI
  `naturali get-generation`) carries `extraction` keyed by rule id —
  `{ "candidates": 1, "created": 1, "skipped": 0, "superseded": 0 }` — and
  `memory_assertions`, one row per write. See `naturali-read-a-run`.

## 4. Ask in a new conversation

The request carries only the new message and never mentions almonds, so an
answer that does came from the store.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "This is Ana again. Is there anything I should avoid when I order?" }] }'
```

```json
{
  "id": "gen_3G5L6BI3tZXkivzs",
  "status": "completed",
  "output": { "content": "Yes, you should avoid ordering anything that contains almonds." }
}
```

- The rule keeps reading every turn of the agent, its own replies included, so
  the store grows with what the agent says as well as what it is told.

Done when the later generation uses the fact without being told again.

## Related skills

- `naturali-let-an-agent-write-memories` — the agent decides mid-turn what to
  save, with a `write_memory` tool, instead of a rule.
- `naturali-search-knowledge` — memories rank alongside documents in a search.
- `naturali-ground-an-agent-in-documents` — the same `knowledge_config`, fed by
  documents you supply.
- `naturali-run-a-generation` — the generation calls in full.
