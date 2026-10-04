---
name: naturali-converse-in-a-session
description: Hold a multi-turn conversation with a naturali.ai agent in a session, answered automatically or on demand, and read its transcript, cost and the model input of any turn. Use when asked to chat with an agent over several turns, open or resume a session, keep context between messages, attribute turns to a customer, read what the agent saw on a turn, or when a session call answers 409 (generation in progress), 410 (expired) or 429 QUOTA_EXCEEDED.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/replay-a-bad-answer
---

# Converse in a session

Outcome: a session holding a multi-turn conversation with the agent — turns
sent, answered in context, and read back.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml`, from `naturali-create-an-agent`, with `AGENT`
  exported.
- Optional: an actor per end user (`Ada` below), from
  `naturali-attribute-spend-to-end-users`.

Ids below are examples; use the ones your own calls return.

## 1. Open the session

A session binds one agent to one thread and creates the conversation that
holds the transcript. `auto_generate: true` makes each posted message start the
reply. Add to `naturali.yaml`:

```yaml
resources:
  Session:
    type: session
    properties:
      agent_id: { ref: Agent }
      name: ticket-4471
      auto_generate: true
      # actor_id: { ref: Ada }   # bill every turn to this end user
      # inactivity_ttl_seconds: 86400   # 0 = never expires
outputs:
  session_id: { ref: Session }
```

Apply it with `naturali-deploy-a-formation`, then read the conversation id the
transcript lives under:

CLI `naturali get-session` · SDK `naturali.sessions.getSession`

```bash
export SESSION=sess_mbfVgSKRIKHn7wOZ
curl "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "sess_mbfVgSKRIKHn7wOZ",
  "agent_id": "agent_wqZgqIhg278sf9eR",
  "conversation_id": "conv_sBuVIHG9g1WSQF3s",
  "actor_id": null,
  "status": "open",
  "auto_generate": true
}
```

```bash
export CONVERSATION=conv_sBuVIHG9g1WSQF3s
```

- A session per live end user (opened when a new customer writes in) is created
  by your app, not the template: `POST …/sessions` with the same properties
  (CLI `naturali create-session` · SDK `naturali.sessions.createSession`); its
  response already carries `conversation_id`. Use the same route without a
  formation only when the user asks for direct calls.
- Without `actor_id` the session has no end user: its turns land in the `null`
  bucket of per-actor usage and no `actor`-scoped quota ever applies.
- `single_session_per_actor: true` on the agent refuses a second open session
  for the same actor.
- `usage` (tokens and `cost_usd` over the session's generations) is on this
  single read only; listings omit it.

## 2. Send a message

With `auto_generate` on, the call saves the message and returns the reply.

CLI `naturali add-session-message` · SDK `naturali.sessions.addSessionMessage`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Hi, my order 4471 arrived with a cracked screen." }'
```

```json
{
  "status": "completed",
  "message": {
    "role": "assistant",
    "content": "Sorry to hear that, since the package arrived damaged, we can definitely process a refund or credit for that order."
  },
  "generation_id": "gen_GcJ9Uzq1K9lF7r1P",
  "trace_id": "trace_XDhQmTFjq9dxjoLy"
}
```

Send the next turn the same way; the agent answers with the whole history in
context:

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

```bash
export GENERATION=gen_WnItK9ZWP1zvPcko
```

- `idempotency_key` in the body deduplicates within the session: the same key
  returns the original message with `200` and starts no second generation —
  what makes a retrying webhook safe.
- If a generation is already running, or `auto_generate` is off, the call
  returns only the saved message (`role: user`).
- `429 QUOTA_EXCEEDED` (with `Retry-After`, `error.meta.quota_id`) means an
  enforced quota is exhausted; the message is still saved.

## 3. Generate on demand (auto_generate off)

On a session with `auto_generate: false` — such as a fork — add the message,
then ask for the reply. Generation is background by default (`202 Accepted`
with nothing to read); `?wait=true` returns the reply.

CLI `naturali add-session-message`, `naturali generate-session-response` · SDK `naturali.sessions.addSessionMessage`, `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Name one use for a paperclip." }'

curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "completed",
  "message": { "role": "assistant", "content": "It can hold papers together to keep them organized." },
  "generation_id": "gen_75KEqGukuWyk0qQp",
  "trace_id": "trace_dSRX56VdezF4qGEE"
}
```

- Without `wait`, poll the generation by `generation_id` (`naturali-read-a-run`).
- Optional body: `model` (override), `tool_context` (headers for the agent's
  `http`/`mcp` tools).
- `status: requires_action` means a `client` tool paused the run — see
  `naturali-run-tools-in-your-own-code`.
- `409`: a generation is already in progress. `410`: the session expired from
  inactivity; open a new one. `502 AI_PROVIDER_ERROR` carries `generation_id`
  and `trace_id` in `error.meta`.
- `429 QUOTA_EXCEEDED` comes back only with `?wait=true`; a background call is
  answered `202` before the quota is read.
- On a managed provider: `503 model_not_priced`, or `402 insufficient_credit`
  (which a message to an `auto_generate` session also answers). A Free account past its
  monthly runs: `403 plan_limit_reached`, `resource: "runs"`.

## 4. Read a turn back

The transcript of one turn shows exactly what the model was given — system
instructions, every earlier message — and what it returned.

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "generation_id": "gen_WnItK9ZWP1zvPcko",
  "agent_version": 1,
  "status": "completed",
  "input": [
    { "role": "system", "content": "Answer in one sentence. If you are unsure, say so.\n\nYou are refund-explainer. …" },
    { "role": "user", "content": "[participant]: Hi, my order 4471 arrived with a cracked screen." },
    { "role": "assistant", "content": [{ "type": "text", "text": "Sorry to hear that, …" }] },
    { "role": "user", "content": "[participant]: So what do I do now? Do I get a refund or not?" }
  ],
  "output": { "content": "I can process a refund … verify the damage first?", "finish_reason": "stop" }
}
```

- When the `input` shows the instructions lack what the answer needed, the fix
  is the agent, not the conversation.
- The session's full message list (with `position`s) is
  `GET …/conversations/$CONVERSATION/messages` — see `naturali-replay-a-turn`.

Done when each message got a reply in context and the transcript shows the
earlier turns in the model's `input`.

## Related skills

- `naturali-replay-a-turn` — branch this session at a message and re-answer it on a fixed agent.
- `naturali-read-a-run` — the full generation record, error meta and trace of a turn.
- `naturali-attribute-spend-to-end-users` — actors, so each session's spend is split per end user.
- `naturali-cap-spend-per-end-user` — one quota capping every actor's sessions.
- `naturali-build-an-eval-dataset` — turn a bad turn's generation into a test case.
