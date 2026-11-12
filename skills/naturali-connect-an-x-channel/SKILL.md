---
name: naturali-connect-an-x-channel
description: Connect an X (Twitter) chat bot to a naturali.ai agent through an x channel so it answers encrypted X Chat direct messages, and prove the round trip on a real DM. Use when asked to connect X or Twitter, answer X DMs with an agent, or find why a naturali X bot does not reply, and on 400 invalid_bot_token, 400 invalid_consumer_credentials, 409 bot_in_use, 429 x_key_registration_limited, 502 x_provisioning_failed or 502 x_unavailable.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/modules/channels
---

# Connect an X channel

Outcome: an X bot account answering X Chat direct messages with your agent,
proven by a real DM and its reply read back through the API.

X Chat is end-to-end encrypted. The channel holds the bot's chat keys and
does every step a bot needs: on connect naturali reads the bot, registers a
webhook on your X app pointing at itself, subscribes it to the bot's incoming
DMs and registers the bot's chat encryption key (private key sealed). Each DM
is decrypted, routed, answered, and the reply encrypted and sent.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml` that answers in plain text, from
  `naturali-create-an-agent`. Never one with an `output_schema`: the reply is
  delivered verbatim, so users would read JSON.
- An X developer app with a chat bot account. From the X developer portal,
  not naturali's API:
  - the bot's **bot token** — your app → Chat bots;
  - the app's **consumer key** and **consumer secret** — Keys and tokens of
    the app that issued the bot token.

Keep all three in your shell, never in a file you might commit:

```bash
export X_BOT_TOKEN=...
export X_CONSUMER_KEY=...
export X_CONSUMER_SECRET=...
```

Ids below are examples; use the ones your own calls return.

## 1. Declare the channel

Add to `naturali.yaml`:

```yaml
parameters:
  XBotToken: { type: string, no_echo: true }
  XConsumerKey: { type: string, no_echo: true }
  XConsumerSecret: { type: string, no_echo: true }
resources:
  XBot:
    type: channel
    properties:
      channel: x
      bot_token: { param: XBotToken }
      consumer_key: { param: XConsumerKey }
      consumer_secret: { param: XConsumerSecret }
      default:
        action: agent
        agent_id: { ref: Agent }
outputs:
  channel_id: { ref: XBot }
```

Apply it with `naturali-deploy-a-formation`, passing the three parameters.
Then:

```bash
export CHANNEL=chan_V1StGXR8Z5jdHi6B   # outputs.channel_id
```

`GET …/channels/$CHANNEL` (CLI `naturali get-channel`) shows `username` (the
bot's handle, without `@`), `bot_user_id`, `chat_key_version` and
`has_credential: true`; no credential is ever returned.

| Answer | Meaning |
| --- | --- |
| `400 invalid_bot_token` / `400 invalid_consumer_credentials` | X rejected a credential; nothing was provisioned. Copy the consumer pair from the app that owns the bot. |
| `409 bot_in_use` | Another channel already holds this bot. |
| `502 x_provisioning_failed` | X refused the webhook or subscription, with X's reason; an app holds a limited number of webhooks. |
| `429 x_key_registration_limited` | The bot spent its few daily chat key registrations; retry after `details.reset_at`. |
| `502 x_unavailable` | X could not be reached; retry. |
| `403 plan_limit_reached` | Active channels are capped across the billing owner's projects (1 Free, 10 Pro, 100 Business), checked before any credential is used. |
| `501` | X channels are not enabled on this deployment. |

- The chat key is registered last, so a refused webhook or subscription spends
  no daily registration. A bot that already registered a key keeps it by
  adding `chat_private_keys` (exported, base64) and `chat_key_version`; send
  both or neither. Messages encrypted for an older key cannot be read.
- `bot_token`, `consumer_key`, `consumer_secret` and `chat_private_keys` are
  write-only: never stored in the formation, always read as changed, so pass
  the parameters again on every update. An update rotates only `bot_token`,
  and only to a token of the same bot.
- `channel` cannot change on a deployed channel; declare a new one.
- `default` answers when no route matches and the address has no action of
  its own; `action: agent` keeps one session per X user. X has one surface,
  `dm`, and the `address_known` route predicate (`GET /v1/channel-kinds`).
- Without a formation (only when the user asks): `POST …/channels` with
  `channel: x`, the three credentials and `default` (CLI
  `naturali create-channel` · SDK `naturali.channels.createChannel`); pass
  `idempotency_key` so a timed-out create can be retried safely.

## 2. Validate it with a real DM

From another X account, open X Chat and send `@username` (the channel's
`username`) a DM, e.g. `Hello, this is a test.` A first DM is a message
request; the channel accepts it before replying. Then confirm from naturali's
side — one conversation per X user:

CLI `naturali list-channel-conversations` · SDK `naturali.channels.listChannelConversations`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/channels/$CHANNEL/conversations" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{
    "id": "conv_V1StGXR8Z5jdHi6B",
    "channel_id": "chan_V1StGXR8Z5jdHi6B",
    "identifier": "x:dm:2244994945",
    "actor_id": "actor_V1StGXR8Z5jdHi6B",
    "session_id": "sess_V1StGXR8Z5jdHi6B"
  }],
  "next_cursor": null
}
```

```bash
export CONVERSATION=conv_V1StGXR8Z5jdHi6B
```

- The identifier is `x:dm:<sender user id>`; filter with `?identifier=`.
- Empty `data` means no DM reached naturali: check the channel is `active`,
  that the DM went to the bot's handle, and that no route or address answers
  `silence`.

CLI `naturali list-channel-conversation-messages` · SDK `naturali.channels.listChannelConversationMessages`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/channels/$CHANNEL/conversations/$CONVERSATION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "role": "user", "content": "Hello, this is a test.", "position": 0 },
    { "role": "assistant", "content": "Hi there! How can I help?", "position": 1 }
  ],
  "next_cursor": null
}
```

Done when the conversation lists both messages with `role: "assistant"` last,
and the same reply arrived in the X DM.

- Tearing down the channel deletes the subscription and the webhook on your
  X app; the chat key stays registered on the bot.

## Related skills

- `naturali-create-an-agent` — the plain-text agent the channel answers with.
- `naturali-deploy-a-formation` — apply, update and tear down the channel.
- `naturali-recognise-one-user-across-channels` — make an X user the same actor as in your app.
- `naturali-sign-in-with-a-provider` — an X login for the same users.
- `naturali-connect-a-discord-channel` — the same flow on Discord.
