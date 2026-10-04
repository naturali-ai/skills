---
name: naturali-connect-a-discord-channel
description: Declare a naturali.ai agent and a Discord channel routing to it in a formation template, deploy it, and prove the round trip by reading a real direct message and the agent's reply back through the API. Use when asked to connect Discord, put an agent behind a Discord bot, create a discord channel, answer Discord DMs with an agent, or check why a naturali Discord bot does not reply.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/connect-a-discord-channel
---

# Connect a Discord channel

Outcome: a Discord bot connected to a naturali agent, with proof — a real
message sent from Discord and a real reply read back through the API — that it
works end to end.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, from
  `naturali-enable-naturali-models` (managed models) or
  `naturali-create-a-provider` (bring your own key).
- `NATURALI_PROJECT=$PROJECT` — lets the CLI omit `--project-id`.
- A Discord account with permission to create applications.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

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
  you share a server with. Skip it and no message is ever delivered.
- The bot token is a live credential: keep it in your shell, never in a file
  you might commit (including the template).

```bash
export DISCORD_APPLICATION_ID=1290000000000000009
export DISCORD_BOT_TOKEN=...   # from the Bot tab, shown once
```

## 2. Declare the agent and the channel

One template holds the agent and the channel that routes to it. A channel
delivers the reply verbatim, so the agent must answer in plain text: never give
it an `output_schema`. The channel's properties are the channels API's field
names; `default` is what answers when nothing more specific does. Leave `modes`
unset: `dms` is on by default. Save as `discord.yaml`:

```yaml
parameters:
  ProviderId:
    type: string
  DiscordApplicationId:
    type: string
  DiscordBotToken:
    type: string
    no_echo: true
resources:
  Agent:
    type: agent
    properties:
      name: discord-bot
      ai_provider_id:
        param: ProviderId
      instructions: You are a friendly assistant answering Discord messages. Keep replies short.
  Discord:
    type: channel
    properties:
      channel: discord
      application_id:
        param: DiscordApplicationId
      bot_token:
        param: DiscordBotToken
      default:
        action: agent
        agent_id:
          ref: Agent
outputs:
  agent_id:
    ref: Agent
  channel_id:
    ref: Discord
```

- The bot token goes in the `no_echo` parameter, never inline. It is
  write-only: the deploy sends it and never stores or returns it, so it reads
  as changed on every update and must be passed again.

## 3. Deploy it

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t discord.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t discord.yaml --arg p "$PROVIDER" \
        --arg a "$DISCORD_APPLICATION_ID" --arg b "$DISCORD_BOT_TOKEN" \
        '{name: "discord-bot", template: $t,
          parameters: {ProviderId: $p, DiscordApplicationId: $a, DiscordBotToken: $b}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_k9NE10JLBlOAN6pP", "channel_id": "chan_v3Gm200xIYC0HkbB" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- A deployed channel means the connection was accepted, not that a bot is
  listening: the token is not checked against Discord, so a mistyped one is
  accepted too. Step 4 is the proof.
- The gateway worker picks up a new connection on its next poll. If the first
  DM gets no reply within a few seconds, wait and send another.
- Only when the user asks for direct calls: `POST …/agents` (CLI
  `naturali create-agent` · SDK `naturali.agents.createAgent`), then
  `POST …/channels` with `channel`, `application_id`, `bot_token` and
  `default: { "action": "agent", "agent_id": … }` (CLI `naturali create-channel`
  · SDK `naturali.channels.createChannel`). Its answer shows
  `has_credential: true` and `modes: { "dms": true, "mention_threads": false }`.

```bash
export FORMATION=form_EPis15Nfukary167
export AGENT=agent_k9NE10JLBlOAN6pP
export CHANNEL=chan_v3Gm200xIYC0HkbB
```

## 4. Validate it with a real DM

In the Discord client (not the API), send the bot a DM, e.g.
`Hello, this is a test.` It should reply within a few seconds. Then confirm
from naturali's side — one conversation per Discord user:

CLI `naturali list-channel-conversations` · SDK `naturali.channels.listChannelConversations`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/channels/$CHANNEL/conversations" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [{ "id": "conv_V1StGXR8Z5jdHi6B", "identifier": "discord:dm:749641174410854402",
             "actor_id": "actor_V1StGXR8Z5jdHi6B", "session_id": "sess_V1StGXR8Z5jdHi6B" }],
  "next_cursor": null
}
```

- Empty `data` means no DM arrived — most often a wrong bot token or a bot that
  shares no server with you (step 1.5).

Read the exchange with the conversation's `id`:

CLI `naturali list-channel-conversation-messages` · SDK `naturali.channels.listChannelConversationMessages`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/channels/$CHANNEL/conversations/conv_V1StGXR8Z5jdHi6B/messages" \
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

- `naturali-first-agent-generation` — create and test the agent on its own first.
- `naturali-structured-output` — the `output_schema` a channel agent must not have.
