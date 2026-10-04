---
name: naturali-replay-a-bad-answer
description: Replace one bad naturali.ai agent answer on its own history by reading the bad turn back, finding the message position to branch at, declaring the fix as a new agent in a formation template and deploying it, forking the session at the customer's question and answering again, with the original session left intact. Use when a naturali agent gave a wrong or evasive answer in a real conversation, when asked to replay, reproduce or retry a turn with a fixed agent, fork or branch a session, test a prompt fix against the exact context the agent saw, or list a session's forks.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/replay-a-bad-answer
---

# Replay a bad answer

Outcome: a bad answer replaced on its own history — the same conversation,
branched at the customer's question and answered again by a fixed agent, with
the original left intact beside it.

Retyping the conversation tests a paraphrase; forking the session tests the
exact context the agent saw.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT`, `PROVIDER` and `AGENT` — the agent from
  `naturali-first-agent-generation`. Its instructions carry no refund policy,
  which is what makes its answer go wrong.
- `jq`, to put the template file into the JSON body.

Every reply below is one generation: three in all.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Start a session

`auto_generate: true` makes each customer message answer itself.

- The session stays a direct call, not a formation resource: step 5 needs its
  `conversation_id`, which only this response carries (a template's `outputs`
  give a resource's own id).

CLI `naturali create-session` · SDK `naturali.sessions.createSession`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"$AGENT\",
    \"name\": \"ticket-4471\",
    \"auto_generate\": true
  }"
```

```json
{ "id": "sess_mbfVgSKRIKHn7wOZ", "conversation_id": "conv_sBuVIHG9g1WSQF3s", "status": "open", "auto_generate": true }
```

```bash
export SESSION=sess_mbfVgSKRIKHn7wOZ
export CONVERSATION=conv_sBuVIHG9g1WSQF3s
```

## 2. Send the first message

Saves the customer's message and, with `auto_generate` on, returns the reply.

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Hi, my order 4471 arrived with a cracked screen." }'
```

```json
{ "status": "completed", "message": { "role": "assistant", "content": "Sorry to hear that, …" }, "generation_id": "gen_GcJ9Uzq1K9lF7r1P" }
```

## 3. Ask the question that goes wrong

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "So what do I do now? Do I get a refund or not?" }'
```

```json
{
  "status": "completed",
  "message": { "role": "assistant", "content": "I can process a refund for a cracked screen issue, but have you tried shipping the device back so the warehouse can verify the damage first?" },
  "generation_id": "gen_WnItK9ZWP1zvPcko"
}
```

- The bad answer: a yes/no question, hedged, with an invented ship-it-back
  step. Your model may word it differently; any dodge will do.

```bash
export GENERATION=gen_WnItK9ZWP1zvPcko
```

## 4. Read the bad turn back

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "agent_version": 1,
  "input": [
    { "role": "system", "content": "Answer in one sentence. If you are unsure, say so.\n\nYou are refund-explainer. …" },
    { "role": "user", "content": "[participant]: Hi, my order 4471 arrived with a cracked screen." },
    { "role": "assistant", "content": [{ "type": "text", "text": "Sorry to hear that, …" }] },
    { "role": "user", "content": "[participant]: So what do I do now? Do I get a refund or not?" }
  ],
  "output": { "content": "I can process a refund … verify the damage first?", "finish_reason": "stop" }
}
```

- `input` names the cause: no refund policy in the instructions, so the model
  made one up. Fix the instructions, not the conversation.

## 5. Find where to branch

A fork branches **after** a message `position`.

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
    { "position": 3, "role": "assistant", "document_id": "doc_4scGDjrKPeiqnJup", "content": "I can process a refund … first?" }
  ],
  "total": 4
}
```

Position 2 is the question: branching there keeps everything up to it and
drops the answer being replaced.

## 6. Write the fix as a new agent

A second agent, so the original keeps serving and stays available to compare.
Save as `fixed-agent.yaml`:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  FixedAgent:
    type: agent
    properties:
      name: refund-explainer-v2
      ai_provider_id:
        param: ProviderId
      instructions: "Answer in two short sentences. Policy: an item that arrives damaged gets a full refund or a free replacement, the customer's choice, and nothing needs to be sent back. Ask for a photo of the damage."
outputs:
  agent_id:
    ref: FixedAgent
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t fixed-agent.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t fixed-agent.yaml --arg p "$PROVIDER" \
        '{name: "refund-explainer-v2", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_ixltZtxnUCYlkZBV" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The `instructions` value is quoted because it contains `: `.
- Only when the user asks for direct calls: `POST …/agents` with the same
  properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

```bash
export FIXED_FORMATION=form_EPis15Nfukary167
export FIXED_AGENT=agent_ixltZtxnUCYlkZBV
```

## 7. Fork at the question

Branches after `fork_at_position`; `agent_id` sets who answers on the branch.

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
  "auto_generate": false
}
```

```bash
export FORK=sess_ME7EHfzUrcgW74HT
```

- The fork holds positions 0 to 2 and points at the **same documents** as the
  parent, so its history cannot drift.
- It is created inert (`auto_generate: false`): nothing runs until you ask.
- A fork replays recorded tool results as model input and never re-runs tools,
  so a "what if" cannot send an email or charge a card twice; it sees tool data
  as it was, not as it is now.

## 8. Answer again on the fork

CLI `naturali generate-session-response` · SDK `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$FORK/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "message": { "role": "assistant", "content": "No, we don't require the item to be returned for a refund or replacement. Please attach a photo of the damage to your original email so we can take care of it right away." },
  "generation_id": "gen_HJEoOLi1M5JkMPis"
}
```

Done when the fork's reply gives the policy instead of the invented step, and
`GET /v1/projects/{project_id}/sessions/{session_id}/forks` on the original
session — which still holds all four messages — lists the branch:

```json
{ "data": [{ "id": "sess_ME7EHfzUrcgW74HT", "forked_from_session_id": "sess_mbfVgSKRIKHn7wOZ", "forked_from_position": 2, "name": "ticket-4471-retry" }], "total": 1 }
```

## Related skills

- `naturali-score-an-agent-change` — promote the bad turn into a dataset item so it cannot regress quietly.
- `naturali-roll-out-an-agent-version` — ship the fix to real traffic as a new version beside the old one.
- `naturali-debug-a-failed-run` — when the turn failed on a tool rather than on the instructions.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
