---
name: naturali-create-a-provider
description: Create a naturali.ai project, declare a model vendor API key as a write-only secret and the bring-your-own-key AI provider that uses it in a formation template, deploy it, and validate the credential by listing the models it can run. Use when asked to add an OpenAI (or other vendor) key to naturali, bring your own key, create a BYOK provider, store a model credential as a secret, or check which models a naturali provider can reach.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/create-a-provider
---

# Create a provider

Outcome: a working, validated AI provider — the model credential every agent in
your project generates through.

## Before you start

- `NATURALI_TOKEN` — an account-scoped `nat_sk_…` API key (or a session JWT).
- `OPENAI_API_KEY` — a model vendor key (OpenAI here).
- A client: CLI `pnpm add -g @naturali/cli` (reads `NATURALI_TOKEN` from the
  environment), or SDK `pnpm add @naturali/sdk` with
  `new NaturaliClient({ token: process.env.NATURALI_TOKEN })`, or plain curl.
- `jq`, to put the template file into the JSON body.
- No vendor account? Use `naturali-enable-naturali-models` instead.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create a project

- A project-scoped key cannot create projects: this answers
  `403 access_denied`.

CLI `naturali create-project` · SDK `naturali.projects.createProject`

```bash
curl -X POST https://api.naturali.ai/v1/projects \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "getting started" }'
```

```json
{ "id": "proj_V1StGXR8Z5jdHi6B", "role": "owner", "status": "active" }
```

```bash
export PROJECT=proj_V1StGXR8Z5jdHi6B
```

## 2. Declare the credential and the provider

Credentials are never passed inline to a provider: the template declares the key
as a `secret`, filled from a `no_echo` parameter so the value never sits in the
file, and an `ai_provider` that references it. Save as `provider.yaml`:

```yaml
parameters:
  OpenAiKey:
    type: string
    no_echo: true
resources:
  Key:
    type: secret
    properties:
      name: openai-production
      value:
        param: OpenAiKey
  Provider:
    type: ai_provider
    properties:
      name: openai-production
      provider: openai
      default_model: gpt-4o-mini
      secret_id:
        ref: Key
outputs:
  secret_id:
    ref: Key
  ai_provider_id:
    ref: Provider
```

- The secret is write-only: no endpoint ever reads the value back; `has_value`
  is all a read reports.
- `provider` must be a literal (or a parameter carrying one); a `ref` or `sub`
  there is refused with `400 bad_request`.
- A vendor that needs no credential (a local `ollama`) takes a `base_url` and
  no `secret_id`.
- Only when the user asks for direct calls: `POST …/secrets` with `name` and
  `value` (CLI `naturali create-secret` · SDK `naturali.secrets.createSecret`),
  then `POST …/ai-providers` with `secret_id` (CLI `naturali create-ai-provider`
  · SDK `naturali.aiProviders.createAiProvider`).

## 3. Deploy them

Validate (creates nothing), then deploy with the key as a parameter:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t provider.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t provider.yaml --arg k "$OPENAI_API_KEY" \
        '{name: "openai-production", template: $t, parameters: {OpenAiKey: $k}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "secret_id": "sec_l4gKTvGnouZ68huG", "ai_provider_id": "aip_JPvMSUTATh7C6Bn6" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The provider is created whether or not the key works — nothing calls the
  vendor yet. Step 4 is what proves it.

```bash
export PROVIDER_FORMATION=form_EPis15Nfukary167
export PROVIDER=aip_JPvMSUTATh7C6Bn6
```

## 4. Validate it

The call goes out with this provider's credential, so a `200` proves secret,
provider and vendor together.

CLI `naturali list-ai-provider-models` · SDK `naturali.aiProviders.listAiProviderModels`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/ai-providers/$PROVIDER/models" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "provider": "openai", "models": [{ "id": "gpt-4o-mini" }, { "id": "gpt-4o" }, { "id": "o3-mini" }] }
```

- Each `id` is usable as `default_model` or an agent's `model`.
- A key the vendor rejects answers `502` with `MODEL_LISTING_FAILED`. Rotate
  the key with `PUT …/formations/{formation_id}` (CLI `naturali update-formation`
  · SDK `naturali.formations.updateFormation`), the same template and the new
  `OpenAiKey` parameter, and retry; the provider does not need recreating.

Done when the models listing answers `200` with the models the credential can
run.

## Related skills

- `naturali-first-agent-generation` — create an agent on this provider and run it.
- `naturali-enable-naturali-models` — managed models with no credential of your own.
