---
name: naturali-replay-a-turn
description: Re-answer one turn of a real naturali.ai conversation on its exact history by forking the session onto a fixed agent, leaving the original intact. Use when an agent gave a bad, wrong or evasive answer in a real session, when asked to replay, reproduce, retry or branch a turn, fork a session, test a prompt fix on the context the agent actually saw, compare two agents on one conversation, or list a session's forks.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/replay-a-bad-answer
---

# Replay a turn

Outcome: the bad answer replaced on its own history — the session branched at
the customer's question and answered again by a fixed agent, the original left
intact beside it. Retyping the conversation tests a paraphrase; a fork tests the
exact context the agent saw.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `SESSION` and its `CONVERSATION` holding the bad answer, from
  `naturali-converse-in-a-session`.
- The fix as a second agent, so the original keeps serving and stays available
  to compare against. Add it with `naturali-create-an-agent`, e.g.:

  ```yaml
  resources:
    FixedAgent:
      type: agent
      properties:
        name: refund-explainer-v2
        ai_provider_id: { ref: Provider }
        instructions: "Answer in two short sentences. Policy: an item that arrives damaged gets a full refund or a free replacement, the customer's choice, and nothing needs to be sent back. Ask for a photo of the damage."
  outputs:
    fixed_agent_id: { ref: FixedAgent }
  ```

  ```bash
  export FIXED_AGENT=agent_ixltZtxnUCYlkZBV
  ```

Ids below are examples; use the ones your own calls return. This replay makes
one generation.

## 1. Find where to branch

A fork branches **after** a message `position`. List the session's messages.

CLI `naturali list-conversation-messages` · SDK `naturali.conversations.listConversationMessages`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/conversations/$CONVERSATION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "position": 0, "role": "user", "document_id": "doc_Mvb2wcDMJ0mCpaY9", "content": "Hi, my order 4471 arrived with a cracked screen." },
    { "position": 1, "role": "assistant", "document_id": "doc_ddGeJI4bF68l70tt", "content": "Sorry to hear that, …" },
    { "position": 2, "role": "user", "document_id": "doc_P6hzgzI9kxCHjTbE", "content": "So what do I do now? Do I get a refund or not?" },
    { "position": 3, "role": "assistant", "document_id": "doc_4scGDjrKPeiqnJup", "content": "I can process a refund … verify the damage first?" }
  ],
  "total": 4
}
```

Position 2 is the customer's question: branching there keeps everything up to
it and drops the answer being replaced.

## 2. Fork at the question

`fork_at_position` is where to branch; `agent_id` is who answers on the branch.

CLI `naturali fork-session` · SDK `naturali.sessions.forkSession`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/fork" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"fork_at_position\": 2,
    \"agent_id\": \"$FIXED_AGENT\",
    \"name\": \"ticket-4471-retry\"
  }"
```

```json
{
  "id": "sess_ME7EHfzUrcgW74HT",
  "agent_id": "agent_ixltZtxnUCYlkZBV",
  "conversation_id": "conv_SU0DID9CkMKdAByZ",
  "forked_from_session_id": "sess_mbfVgSKRIKHn7wOZ",
  "forked_from_position": 2,
  "status": "open",
  "auto_generate": false
}
```

```bash
export FORK=sess_ME7EHfzUrcgW74HT
```

- The fork's conversation holds positions 0–2 and points at the **same
  documents** as the parent (no copy), so the history cannot drift from what
  happened.
- It is created inert: `auto_generate: false`, nothing runs until you ask.
- Omit `fork_at_position` to branch at the tip; omit `agent_id` to keep the
  parent's agent. A position that names no message, or an agent from another
  project, is `400 VALIDATION_FAILED`.
- The fork has no actor. Attach one only if the same end user will drive the
  branch — a `single_session_per_actor` agent allows one open session per actor.
- `tool_context` is inherited from the parent unless the fork body overrides it.
- Recorded tool results are **replayed** as model input, never re-run: a "what
  if" cannot send an email or charge a card twice, and it sees the tool data as
  it was, not as it is now.

## 3. Answer again on the fork

CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$FORK/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "message": {
    "role": "assistant",
    "content": "No, we don't require the item to be returned for a refund or replacement. Please attach a photo of the damage to your original email so we can take care of it right away."
  },
  "generation_id": "gen_HJEoOLi1M5JkMPis",
  "trace_id": "trace_sOA19UFrqWc2I0Tv"
}
```

The same three messages, answered by the fixed agent, give the policy instead
of an invented step. Keep the conversation going on `$FORK` with the ordinary
message and generate calls (`naturali-converse-in-a-session`).

- A fork's `usage` starts at zero, so summing a session and its forks never
  double-counts.

## 4. Prove the branch

The original session still holds all four messages; its forks list the branch.

CLI `naturali list-session-forks` · SDK `naturali.sessions.listSessionForks`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/forks" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    {
      "id": "sess_ME7EHfzUrcgW74HT",
      "agent_id": "agent_ixltZtxnUCYlkZBV",
      "forked_from_session_id": "sess_mbfVgSKRIKHn7wOZ",
      "forked_from_position": 2,
      "name": "ticket-4471-retry"
    }
  ],
  "total": 1
}
```

- One level of lineage: a fork of a fork is listed under its own parent.

Done when the fork's reply is the fixed answer and the parent's forks list it
while the parent still lists four messages.

## Related skills

- `naturali-build-an-eval-dataset` — promote the bad turn's generation into a test case so it cannot regress quietly.
- `naturali-roll-out-an-agent-version` — ship the fix to real traffic as a new version beside the old one.
- `naturali-read-a-run` — when the turn failed on a tool rather than on the instructions.
