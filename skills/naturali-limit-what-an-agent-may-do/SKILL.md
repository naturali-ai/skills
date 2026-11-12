---
name: naturali-limit-what-an-agent-may-do
description: "Declare a naturali.ai policy and name it in an agent's policy_ids so the platform refuses actions it takes on the agent's behalf, such as writing memories, and read the refusal in the transcript. Use when asked to restrict, sandbox or limit an agent's permissions, stop it writing memory, make it read-only, deny it an IAM action, or on 403 POLICY_GRANT_NOT_HELD, 409 POLICY_HAS_DEPENDENTS or a transcript showing \"Forbidden: boundary policy denies\"."
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/limit-what-an-agent-may-do
---

# Limit what an agent may do

Outcome: an agent whose policy refuses an action — proven by the same kind of
request that wrote a memory before the policy being refused after it, with
nothing written.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml` with a `write_memory` tool on `Store`, a fact it
  already wrote, and `AGENT` and `STORE` exported, from
  `naturali-let-an-agent-write-memories`. Use your template's logical ids if
  they differ.

Ids below are examples; use the ones your own calls return.

## 1. Declare the policy and attach it

Add the `ProjectId` parameter and `NoMemoryWrites`, and edit `Agent`, in
`naturali.yaml`:

```yaml
parameters:
  ProjectId:                       # added; send your PROJECT
    type: string
resources:
  NoMemoryWrites:                  # added
    type: policy
    properties:
      name: no-memory-writes
      description: Everything in the project except writing memories.
      document:
        statement:
          - effect: Allow
            action: ["*"]
            resource:
              - sub: 'srn:${ProjectId}:*:*'
          - effect: Deny
            action: ["memories:CreateMemory", "memories:UpdateMemory"]
  Agent:
    type: agent
    properties:
      name: support
      ai_provider_id: { ref: Provider }
      instructions: You answer customers of a bakery. When a customer asks you to remember something, save it with the write_memory tool, then confirm in one sentence.
      knowledge_config:
        memory_store_ids:
          - ref: Store
        write_memory_store_id: { ref: Store }
      policy_ids:                  # added
        - ref: NoMemoryWrites
```

Apply it with `naturali-deploy-a-formation` (parameters
`{"ProjectId":"$PROJECT"}`); the plan creates `NoMemoryWrites` and updates
`Agent`.

- A policy on its own grants and refuses nothing; it takes effect where an
  agent's (or a trigger's) `policy_ids` names it. A generation then acts as
  the caller's permissions intersected with the policies, so a policy can only
  narrow, whoever calls the agent.
- `write_memory` needs `memories:CreateMemory` for a new fact and
  `memories:UpdateMemory` for one that supersedes an old one; deny both. A
  `Deny` always wins over an `Allow`.
- Each statement takes `effect`, `action` (e.g. `memories:*`,
  `agents:DeleteAgent`) and optionally `resource` and `condition`
  (`iam:ResourceType` or `iam:ResourceTag/<tag>`). An `Allow` may name only
  this project's resources (`srn:<project_id>:<type>:<id>`), else `400`.
- Attaching needs every grant the policy carries, else `403
  POLICY_GRANT_NOT_HELD`: a policy never lends more than its attacher holds.
- A policy governs the actions the platform runs for the agent, like
  `write_memory`. Your own `http`, `client` and `mcp` tools are governed by
  guardrails instead (`naturali-gate-a-tool-with-guardrails`); channels,
  webhooks, API keys and the marketplace by membership and key capabilities.
- `policy_ids` is configuration: the change is a new agent version.
- Deleting a policy an agent or trigger still names answers `409
  POLICY_HAS_DEPENDENTS`; detach it first.
- Without a formation (only when the user asks): `POST …/policies` with
  `name`, `description`, `document` (CLI `naturali create-policy` · SDK
  `naturali.policies.createPolicy`), then `PATCH …/agents/$AGENT` with
  `{ "policy_ids": ["$POLICY"] }` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 2. Ask again

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Please remember that I prefer rye bread." }] }'
```

```json
{
  "id": "gen_meq4Abzn9a1FBDEm",
  "status": "completed",
  "output": { "content": "I'm sorry, I couldn't save that because the memory system denied the request.", "finish_reason": "stop" }
}
```

```bash
export GENERATION=gen_meq4Abzn9a1FBDEm
```

A reply is the model's words, not a record of what ran; it could as well
claim the fact was saved.

## 3. Read the refusal

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "generation_id": "gen_meq4Abzn9a1FBDEm",
  "agent_version": 3,
  "status": "completed",
  "step_count": 2,
  "steps": [
    {
      "index": 0,
      "finish_reason": "tool-calls",
      "tool_calls": [{ "id": "toolu_01VU…", "tool_name": "write_memory", "args": { "content": "Customer prefers rye bread." } }],
      "tool_results": [{
        "tool_call_id": "toolu_01VU…",
        "tool_name": "write_memory",
        "result": { "error": "Forbidden: boundary policy denies memories:CreateMemory" },
        "error": null
      }]
    },
    { "index": 1, "text": "I'm sorry, I couldn't save that…", "finish_reason": "stop" }
  ]
}
```

- The policy refused the call before anything was written. The refusal
  reaches the model as the tool's result, not as a failed generation, which is
  why the turn still completed.
- To keep the reply honest, tell the agent in its instructions what to say
  when a save is refused.

## 4. Confirm nothing was written

CLI `naturali list-memories` · SDK `naturali.memories.listMemories`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/memories?memory_store_id=$STORE" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "id": "mem_mzDhtoJldyTFoDRM", "content": "Customer picks up their order on Fridays.", "version": 1 }],
  "next_cursor": null
}
```

Done when the store holds what the agent wrote before the policy and nothing
after: the agent still reads the store and can no longer change it.

## Related skills

- `naturali-gate-a-tool-with-guardrails` — the equivalent control for your own
  tools: run, ask a person, or refuse.
- `naturali-run-an-agent-on-a-schedule` — a trigger's `policy_ids` is what a
  firing acts under.
- `naturali-read-a-run` — every other way to read back what a turn did.
- `naturali-roll-out-an-agent-version` — send the stricter version to a slice
  of traffic first.
