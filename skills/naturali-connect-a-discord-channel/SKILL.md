---
name: naturali-connect-a-discord-channel
description: Connect a Discord bot to a naturali.ai agent through a discord channel and prove the round trip on a real direct message. Use when asked to connect Discord, put an agent behind a Discord bot, answer Discord DMs with an agent, or find why a naturali Discord bot does not reply, and on 400 invalid_bot_token, 400 application_mismatch, 409 application_in_use or a channel gateway_error.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/connect-a-discord-channel
---

# Connect a Discord channel

Outcome: a Discord bot answering direct messages with your agent, proven by a
real DM and its reply read back through the API.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml` that answers in plain text, from
  `naturali-create-an-agent`, e.g. instructions "You are a friendly assistant
  answering Discord messages. Keep replies short." Never one with an
  `output_schema`: the reply is delivered verbatim, so users would read JSON.
  Use your template's logical id if it differs.
- A Discord account with permission to create applications.

Ids below are examples; use the ones your own calls return.

## 1. Create a Discord app and bot

On the Discord Developer Portal (https://discord.com/developers/applications),
not naturali's API:

1. **New Application**; the name is cosmetic.
2. Copy the **Application ID** from **General Information**.
3. **Bot** tab → **Reset Token**, copy the token. Discord shows it once.
4. Under **Privileged Gateway Intents**, leave everything off: the default
   `dms` flow needs none (`mention_threads` needs `MESSAGE_CONTENT`).
5. **OAuth2** → **URL Generator**, tick the `bot` scope, open the URL and add
   the bot to a server you administer. The DM flow needs no permissions ticked.

- Step 5 is what makes the bot reachable: Discord only opens a DM with a bot
  you share a server with. Without it no message is ever delivered, and nothing
  appears on naturali's side either.
- The bot token is a live credential: keep it in your shell, never in a file
  you might commit.

```bash
export DISCORD_APPLICATION_ID=1290000000000000009
export DISCORD_BOT_TOKEN=...   # from the Bot tab, shown once
```

## 2. Declare the channel

Add to `naturali.yaml`:

```yaml
parameters:
  DiscordApplicationId:
    type: string
  DiscordBotToken:
    type: string
    no_echo: true
resources:
  Discord:
    type: channel
    properties:
      channel: discord
      application_id: { param: DiscordApplicationId }
      bot_token: { param: DiscordBotToken }
      default:
        action: agent
        agent_id: { ref: Agent }
outputs:
  channel_id: { ref: Discord }
```

Apply it with `naturali-deploy-a-formation`, passing `DiscordApplicationId`
and `DiscordBotToken` as parameters. Then:

```bash
export CHANNEL=chan_v3Gm200xIYC0HkbB   # outputs.channel_id
```

- A `channel` resource takes the channels API's field names. `default` is what
  answers when nothing more specific does; `action: agent` keeps one dialogue
  (session) per Discord user.
- Leave `modes` unset: `{ "dms": true, "mention_threads": false }` is the
  default, the flow this skill proves.
- `bot_token` is write-only: never stored in the formation, never returned
  (`has_credential: true` on the channel is all you see). It always reads as
  changed, so pass the parameter again on every update.
- The token is checked with Discord first: `400 invalid_bot_token` when Discord
  rejects it, `400 application_mismatch` when it belongs to another app. One
  channel per application: `409 application_in_use`.
- Active channels are capped across the billing owner's projects (1 Free,
  10 Pro, 100 Business): `403 plan_limit_reached`, before any credential is
  used. `disabled` channels do not count.
- `status: "active"` means the connection was accepted, not that a user can
  reach the bot (step 1.5). The gateway worker picks a new channel up on its
  next poll, within about half a minute.
- Without a formation (only when the user asks): `POST …/channels` with
  `channel`, `application_id`, `bot_token` and `default` (CLI
  `naturali create-channel` · SDK `naturali.channels.createChannel`).

## 3. Validate it with a real DM

In the Discord client, not the API, send the bot a DM, e.g.
`Hello, this is a test.` It should reply within a few seconds; if the first DM
gets no reply, wait a moment and send another. Then confirm from naturali's
side — one conversation per Discord user:

CLI `naturali list-channel-conversations` · SDK `naturali.channels.listChannelConversations`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/channels/$CHANNEL/conversations" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{
    "id": "conv_V1StGXR8Z5jdHi6B",
    "channel_id": "chan_v3Gm200xIYC0HkbB",
    "identifier": "discord:dm:749641174410854402",
    "actor_id": "actor_V1StGXR8Z5jdHi6B",
    "session_id": "sess_V1StGXR8Z5jdHi6B"
  }],
  "next_cursor": null
}
```

```bash
export CONVERSATION=conv_V1StGXR8Z5jdHi6B
```

- Empty `data` means no DM arrived — most often a bot that shares no server
  with you, or a gateway refusal. A row proves the DM reached naturali and
  resolved to an actor and a session.
- `GET …/channels/$CHANNEL` (CLI `naturali get-channel`) shows `gateway_error`
  (`invalid_bot_token`, `disallowed_intents`, `gateway_rejected`) when Discord
  refused the connection. The worker stops retrying until an update changes
  `bot_token`, `modes` or `status`.

CLI `naturali list-channel-conversation-messages` · SDK `naturali.channels.listChannelConversationMessages`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/channels/$CHANNEL/conversations/$CONVERSATION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "role": "user", "content": "Hello, this is a test.", "position": 0 },
    { "role": "assistant", "content": "Hi there! How can I help?", "position": 1 }
  ],
  "total": 2
}
```

Done when the conversation lists both messages in order with
`role: "assistant"` last, and the same reply arrived in your Discord DM.

## Related skills

- `naturali-create-an-agent` — the plain-text agent the channel answers with.
- `naturali-deploy-a-formation` — apply, update and tear down the channel.
- `naturali-attribute-spend-to-end-users` — each Discord user is an actor;
  see what each one spends.
