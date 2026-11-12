---
name: naturali-sign-in-with-a-provider
description: Build a Sign in with X (or any OAuth provider) flow on naturali.ai that maps each provider account to one actor, using an oauth_client, an http tool with oauth_connection auth, a provisional actor and external_id lookup. Use when asked to log users in with X, Google or GitHub, connect a user's provider account, call a provider API as the user, or on 400 ACTOR_NOT_FOUND, a callback 400, or a connection pending or disconnected.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/sign-in-with-a-provider
---

# Sign in with a provider

Outcome: a "Sign in with X" flow that maps each X account to one actor,
proven by a second login with the same account finding the same actor.

A connection is delegated authorization, not authentication: naturali runs the
OAuth flow (PKCE, `state`, code exchange), stores, refreshes and revokes the
tokens (no route returns them) and calls the provider as the actor. Your
backend reads the provider account, finds or creates the user, issues its own
session cookie, and cleans up provisional actors.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
  Every call runs on your backend; the key never reaches the browser.
- An OAuth 2.0 app registered at X with
  `https://api.naturali.ai/v1/oauth/callback` as its redirect URI and the
  `users.read` scope (add `offline.access` for a refresh token). Its client
  secret goes in a `no_echo` parameter.
- The template applied with `naturali-deploy-a-formation`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the OAuth client and the profile tool

Add to `naturali.yaml`:

```yaml
parameters:
  XClientSecret:
    type: string
    no_echo: true
resources:
  XClientSecretValue:
    type: secret
    properties:
      name: x-client-secret
      value: { param: XClientSecret }
  XClient:
    type: oauth_client
    properties:
      name: x
      authorize_url: https://x.com/i/oauth2/authorize
      token_url: https://api.x.com/2/oauth2/token
      revocation_url: https://api.x.com/2/oauth2/revoke
      client_id: Tm9ZWdEX2hQ
      client_secret: { sub: '{{secret:${XClientSecretValue}}}' }
      scopes: [tweet.read, users.read, offline.access]
  XProfile:
    type: tool
    properties:
      name: get-x-profile
      type: http
      execute:
        url: https://api.x.com/2/users/me
        method: GET
        auth:
          type: oauth_connection
          oauth_client_id: { ref: XClient }
outputs:
  oauth_client_id: { ref: XClient }
  tool_id: { ref: XProfile }
```

Apply it with `naturali-deploy-a-formation`, passing `XClientSecret`. Then:

```bash
export OAUTH_CLIENT=oauc_V1StGXR8Z5jdHi6B   # outputs.oauth_client_id
export TOOL=tool_V1StGXR8Z5jdHi6B           # outputs.tool_id
```

- `client_secret` takes only a `{{secret:sec_…}}` reference (a literal is
  `400`); omit it for a public client, which relies on PKCE (`pkce` defaults
  to `true`).
- `redirect_uri` omitted or `null` is `https://api.naturali.ai/v1/oauth/callback`,
  the URI to register at the provider. Set your own only when your front end
  receives the redirect, and forward `code` and `state` to that callback.
- Google needs `authorize_params: { access_type: offline, prompt: consent }`
  for a refresh token.
- Deleting the client deletes its connections without revoking them at the
  provider; delete the connections first to revoke.
- Without a formation (only when the user asks): `POST …/oauth-clients` (CLI
  `naturali create-oauth-client` · SDK `naturali.oauthClients.createOauthClient`)
  and `POST …/tools` (CLI `naturali create-tool` · SDK `naturali.tools.createTool`).

Steps 2 to 6 run per login, from your backend.

## 2. Create a provisional actor

Before consent you do not know who the user is, so start with an actor holding
no `external_id`.

CLI `naturali create-actor` · SDK `naturali.actors.createActor`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/actors" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "pending-login" }'
```

```json
{ "id": "actor_K8vQzL2mN4pR7sT9", "name": "pending-login", "external_id": null }
```

```bash
export PROVISIONAL=actor_K8vQzL2mN4pR7sT9
```

## 3. Start the connection

`return_url` is your backend's login callback.

CLI `naturali create-oauth-connection` · SDK `naturali.oauthConnections.createOauthConnection`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/oauth-connections" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"oauth_client_id\": \"$OAUTH_CLIENT\", \"actor_id\": \"$PROVISIONAL\",
        \"return_url\": \"https://app.example.com/auth/x/return\" }"
```

```json
{
  "id": "ocon_V1StGXR8Z5jdHi6B",
  "status": "pending",
  "authorize_url": "https://x.com/i/oauth2/authorize?response_type=code&client_id=…&state=…",
  "authorize_url_expires_at": "2026-11-11T10:10:00.000Z"
}
```

```bash
export CONNECTION=ocon_V1StGXR8Z5jdHi6B
```

- Keep `id` in a signed, short-lived cookie, then redirect the browser to
  `authorize_url`. Whoever consents there connects their account to this
  actor: hand it only to that person.
- Starting again for the same actor and client restarts the same connection
  (`200`, new `authorize_url`).

## 4. Confirm the connection on return

The browser lands on
`https://app.example.com/auth/x/return?oauth_connection_id=ocon_…&status=connected`
(or `status=failed`). Anyone can type that URL: require that
`oauth_connection_id` matches your cookie, then read the connection.

CLI `naturali get-oauth-connection` · SDK `naturali.oauthConnections.getOauthConnection`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/oauth-connections/$CONNECTION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "ocon_V1StGXR8Z5jdHi6B", "actor_id": "actor_K8vQzL2mN4pR7sT9", "status": "connected" }
```

- Anything but `connected` is a failed login. A replayed, unknown or expired
  `state` (10 minutes), a refused consent or a code the provider refuses makes
  the callback `400`; `error` on the connection says why.

## 5. Read who consented

Call the tool directly with `actor_id`: it sends that actor's token, with no
agent and no generation (more in `naturali-call-a-tool-directly`).

CLI `naturali call-tool` · SDK `naturali.tools.callTool`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/tools/$TOOL/call" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"actor_id\": \"$PROVISIONAL\" }"
```

```json
{ "data": { "id": "2244994945", "name": "Ana", "username": "ana_dev" } }
```

```bash
export SUBJECT=x:2244994945
```

- `data.id` is the stable account id; the username can change. Prefix it with
  the provider so ids from two providers never collide.
- An actor outside the project is `400 ACTOR_NOT_FOUND`; an actor with no
  `connected` connection fails as the tool's error telling it to reconnect.
- A key narrowed by capabilities cannot use a connection from a generation.

## 6. Find or create the user

CLI `naturali list-actors --external-id` · SDK `naturali.actors.listActors`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/actors?external_id=$SUBJECT" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [], "next_cursor": null }
```

**No match: a new user.** The provisional actor becomes the user's actor:

CLI `naturali update-actor` · SDK `naturali.actors.updateActor`

```bash
curl -sS -X PATCH "https://api.naturali.ai/v1/projects/$PROJECT/actors/$PROVISIONAL" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"name\": \"Ana\", \"external_id\": \"$SUBJECT\" }"
export ACTOR=$PROVISIONAL
```

**A match: a returning user.** Use the actor found, and delete the provisional
one (which deletes its connection and revokes its token at X):

CLI `naturali delete-actor` · SDK `naturali.actors.deleteActor`

```bash
curl -sS -X DELETE "https://api.naturali.ai/v1/projects/$PROJECT/actors/$PROVISIONAL" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- Before relying on the returning user's own connection, list it
  (`GET …/oauth-connections?actor_id=$ACTOR`, CLI
  `naturali list-oauth-connections`) and check it is `connected`; if
  `disconnected`, start a connection for that actor (step 3) to ask for
  consent again.
- Issue your own session cookie for the resolved actor; its id is the
  `actor_id` your app passes from then on, in sessions and direct calls.
- naturali does not clean up provisional actors: delete those whose
  `external_id` is still `null` after `authorize_url_expires_at`.

## 7. Prove it: sign in again

Run steps 2 to 6 with the same X account. Step 6 now finds one actor:

```json
{
  "data": [{ "id": "actor_K8vQzL2mN4pR7sT9", "name": "Ana", "external_id": "x:2244994945" }],
  "next_cursor": null
}
```

Done when the second login resolves to the first login's actor and its
provisional actor is deleted.

## Related skills

- `naturali-recognise-one-user-across-channels` — the same actor on a
  messaging channel too.
- `naturali-call-a-tool-directly` — direct calls and their errors.
- `naturali-converse-in-a-session` — open sessions as the signed-in actor.
- `naturali-deploy-a-formation` — apply and tear down the client and tool.
