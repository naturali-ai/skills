---
name: naturali-let-an-agent-write-memories
description: Give a naturali.ai agent a write_memory tool on a memory store (knowledge_config.write_memory_store_id) so it saves what it is asked to remember. Use when asked to let an agent save notes or remember things on request, give it a write_memory tool, have it decide what to store mid-conversation, or check what an agent saved to memory.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/limit-what-an-agent-may-do
---

# Let an agent write memories

Outcome: an agent that saves facts into a memory store when it judges it
should, through a `write_memory` tool the platform runs for it, and reads them
back — with the stored fact listed as proof.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml`, from `naturali-create-an-agent`, and `AGENT`
  exported. Use your template's logical id if it differs.
- Every memory is embedded on write, paid from credit on every plan.

Ids below are examples; use the ones your own calls return.

## 1. Declare the store and the write grant

Add `Store` and edit `Agent` in `naturali.yaml`:

```yaml
resources:
  Store:
    type: memory_store
    properties:
      name: customer-notes
      description: What customers ask the bakery agent to remember.
  Agent:
    type: agent
    properties:
      name: support
      ai_provider_id: { ref: Provider }
      instructions: You answer customers of a bakery. When a customer asks you to remember something, save it with the write_memory tool, then confirm in one sentence.   # changed
      knowledge_config:            # added
        memory_store_ids:
          - ref: Store
        write_memory_store_id: { ref: Store }
outputs:
  memory_store_id: { ref: Store }
```

Apply it with `naturali-deploy-a-formation`; the plan creates `Store` and
updates `Agent`. Then:

```bash
export STORE=mstore_VR4qLsqRvz2N9pBr   # outputs.memory_store_id
```

- `write_memory_store_id` is what makes the `write_memory` tool available; no
  `tool` resource or binding is needed. `memory_store_ids` lets the agent read
  the store back.
- The tool is a capability the agent spends at its own discretion: the
  instructions say when to use it. To have the platform extract facts after
  every turn instead, use a memory rule (`naturali-give-an-agent-long-term-memory`).
- Each write is consolidated against the store: a known fact is skipped, a
  changed one supersedes the old.
- The agent's `boundary_policy` stays `null`: nothing limits it beyond the
  caller's own permissions.
- Without a formation (only when the user asks): `POST …/memory-stores`
  (CLI `naturali create-memory-store` · SDK `naturali.memoryStores.createMemoryStore`),
  then `PATCH …/agents/$AGENT` with `instructions` and `knowledge_config`
  (CLI `naturali patch-agent` · SDK `naturali.agents.patchAgent`).

## 2. Ask it to remember something

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Please remember that I pick up my order on Fridays." }] }'
```

```json
{
  "id": "gen_76uO7BIvKxnUoz3D",
  "status": "completed",
  "output": { "content": "I've noted that you pick up your order on Fridays!", "finish_reason": "stop" }
}
```

```bash
export GENERATION=gen_76uO7BIvKxnUoz3D
```

A reply is the model's words, not a record of what ran. The next step reads
what was stored.

## 3. See the memory it wrote

CLI `naturali list-memories` · SDK `naturali.memories.listMemories`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/memories?memory_store_id=$STORE" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "mem_fOdkVAVocTsQAsq1", "memory_store_id": "mstore_VR4qLsqRvz2N9pBr",
      "content": "Customer picks up their order on Fridays", "invalidated_at": null, "version": 1 }
  ],
  "total": 1
}
```

- Listing always takes `memory_store_id`; there is no cross-store listing.
- The turn's own record shows the call: the transcript
  (`GET …/generations/$GENERATION/transcript`) has a `write_memory` tool call
  and its result, and `GET …/generations/$GENERATION` lists the write in
  `memory_assertions`. See `naturali-read-a-run`.

Done when the store lists the fact the agent was asked to remember.

## Related skills

- `naturali-limit-what-an-agent-may-do` — take the write away with a boundary
  policy while the agent keeps reading.
- `naturali-give-an-agent-long-term-memory` — facts extracted after every turn,
  with no tool.
- `naturali-run-a-generation` — the generation calls in full.
