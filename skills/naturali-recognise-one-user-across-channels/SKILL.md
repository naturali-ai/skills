---
name: naturali-recognise-one-user-across-channels
description: Make one end user the same naturali.ai actor on a messaging channel (WhatsApp, Discord, X) and in your own app, by binding the channel address to your actor with a one-time code from a message.received webhook. Use when asked to link a phone number or chat account to a signed-in user, share quotas, memory or tools across transports, identify who is talking in a tool, or on 409 actor_minted_for_address or a 400 identifier.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/recognise-one-user-across-channels
---

# Recognise one user across channels

Outcome: one end user who is the same actor on WhatsApp and in your own web
chat, proven by their WhatsApp conversation reading back your actor's id.

By default a channel address gets an actor of its own, so the same person on
WhatsApp and in your app is two actors, with quotas, memory and history split.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id;
  `AGENT` — the agent that answers.
- A channel answered by that agent: a WhatsApp number connected by link
  (https://naturali.ai/docs/modules/channels#connecting-whatsapp-by-link),
  `naturali-connect-a-discord-channel` or `naturali-connect-an-x-channel`.
- A webhook subscribed to `message.received`, pointing at your backend. Add
  it beside the channel in `naturali.yaml` and apply with
  `naturali-deploy-a-formation`:

  ```yaml
  parameters:
    WebhookSecret: { type: string, no_echo: true }
  resources:
    Inbound:
      type: webhook
      properties:
        url: https://app.example.com/hooks/naturali
        events: [message.received]
        secret: { param: WebhookSecret }
  ```

  `secret` is yours (a deploy returns no body), write-only and re-sent on every
  update. Verify `X-Naturali-Signature` (HMAC-SHA256 over the raw body) before
  acting on a delivery. `url` must be public `https://`.

Ids below are examples; use the ones your own calls return.

## 1. Create the actor for your user

Use your own user id as `external_id`. Tool calls in this actor's sessions
carry it as `X-Naturali-Context-actor_external_id` (and the id as
`X-Naturali-Context-actor_id`), set from the actor, never from what a caller
sends, so your tools know which user is talking.

CLI `naturali create-actor` · SDK `naturali.actors.createActor`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/actors" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Ana", "external_id": "user_42" }'
```

```json
{ "id": "actor_V1StGXR8Z5jdHi6B", "name": "Ana", "external_id": "user_42" }
```

```bash
export ACTOR=actor_V1StGXR8Z5jdHi6B
```

- Idempotent on `external_id`: a second create answers `200` with the
  existing actor. `GET …/actors?external_id=user_42` finds it again.

## 2. Open your web chat as that actor

Your web chat is a session naming the actor (turns and history in
`naturali-converse-in-a-session`).

CLI `naturali create-session` · SDK `naturali.sessions.createSession`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"agent_id\": \"$AGENT\", \"actor_id\": \"$ACTOR\", \"auto_generate\": true }"
```

```json
{ "id": "sess_V1StGXR8Z5jdHi6B", "agent_id": "agent_V1StGXR8Z5jdHi6B", "actor_id": "actor_V1StGXR8Z5jdHi6B" }
```

## 3. Link the channel address

Show the signed-in user a link that sends a one-time code from their phone,
e.g. `https://wa.me/5511900000000?text=LINK-4F7K2Q`. When your webhook gets a
`message.received` whose `data.content` is a code you issued, bind the address
it came from — `data.identifier`, here `whatsapp:dm:5511999998888` — to that
user's actor.

The code is the only proof the number is the user's: make it single-use,
short-lived and tied to the user who asked for it.

CLI `naturali set-address` · SDK `naturali.channels.setAddress`

```bash
curl -sS -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/addresses/whatsapp%3Adm%3A5511999998888" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"actor_id\": \"$ACTOR\" }"
```

```json
{ "identifier": "whatsapp:dm:5511999998888", "actor_id": "actor_V1StGXR8Z5jdHi6B", "action": null }
```

- URL-encode the identifier. It must be one a channel kind produces
  (`whatsapp:dm:<phone>`, `discord:dm:<user_id>`, `x:dm:<user_id>`), else `400`.
- An upsert: no prior read, no `404` for an address that never wrote.
- A session's actor is fixed, so rebinding deletes the address's
  conversations and sessions (and the actor naturali had created for it); the
  next message opens a fresh one as your actor. An actor you bound is never
  deleted.
- `actor_id: null` releases yours. Binding an actor naturali created for
  another address is `409 actor_minted_for_address`.

## 4. Prove it

Send any message from the phone, then read the address's conversations.

CLI `naturali list-address-conversations` · SDK `naturali.channels.listAddressConversations`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/addresses/whatsapp%3Adm%3A5511999998888/conversations" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "identifier": "whatsapp:dm:5511999998888", "actor_id": "actor_V1StGXR8Z5jdHi6B",
             "session_id": "sess_8kQ2mZp4Rt7Lx1Vb" }],
  "next_cursor": null
}
```

Done when the conversation's `actor_id` is the actor your web chat uses.

- Erasing the address (`DELETE …/addresses/{identifier}`, CLI
  `naturali delete-address`) removes its conversations and sessions; your
  bound actor stays.

## Related skills

- `naturali-sign-in-with-a-provider` — resolve the signed-in user's actor from an X login.
- `naturali-cap-spend-per-end-user` — one actor quota now covers both transports.
- `naturali-attribute-spend-to-end-users` — read spend per actor.
- `naturali-deploy-a-formation` — apply the webhook and channel.
