---
name: naturali-enable-naturali-models
description: Create a naturali.ai project, list the managed model catalog with prices, declare one naturali_ai_provider in a formation template and deploy it to enable every managed model, and prove each one is priced and ready to generate. Use when asked to set up a naturali project with no vendor key, enable naturali models, use managed models, list available naturali models or their prices, or create a provider with provider naturali.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/enable-naturali-models
---

# Enable naturali models

Outcome: a project that can generate on any naturali-managed model, with no
model-vendor account and no credential of your own.

## Before you start

- `NATURALI_TOKEN` — an **account**-scoped `nat_sk_…` API key (or a session
  JWT). No vendor key is needed.
- A client: CLI `pnpm add -g @naturali/cli` (reads `NATURALI_TOKEN` from the
  environment), or SDK `pnpm add @naturali/sdk` with
  `new NaturaliClient({ token: process.env.NATURALI_TOKEN })`, or plain curl.
- `jq`, to put the template file into the JSON body.
- Bringing your own vendor credential instead? Use
  `naturali-create-a-provider`; the two paths are independent and a project
  can use both.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create a project

- A project-scoped key cannot create a project: this answers
  `403 access_denied`. With one, skip this step and export the `PROJECT` it is
  scoped to.

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

You are its `owner` and its billing owner.

```bash
export PROJECT=proj_V1StGXR8Z5jdHi6B
```

## 2. See what naturali offers

The catalog is the same for every project, synced daily.

CLI `naturali list-models` · SDK `naturali.models.listModels`

```bash
curl -G https://api.naturali.ai/v1/models \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d status=available
```

```json
{
  "data": [{ "model": "nova-lite-v1", "status": "available",
    "pricing": { "currency": "usd", "input_per_1k_tokens": 0.00006, "output_per_1k_tokens": 0.00024 } }],
  "next_cursor": "Z3B0LW9zcy1zYWZlZ3VhcmQtMjBi"
}
```

- Paginated: pass `next_cursor` back as `cursor` until it is `null`.
- `model` is the string used everywhere a model is named (`default_model`, an
  agent's `model`); `pricing` is per 1K tokens.
- A model naturali cannot price, or one that does not produce text, is not
  listed; use `naturali-create-a-provider` for those.

## 3. Enable them

Declare one `naturali_ai_provider` in a formation — no credential, priced for
the whole catalog the moment it exists. Save as `provider.yaml`:

```yaml
resources:
  Managed:
    type: naturali_ai_provider
    properties:
      name: naturali
      default_model: nova-lite-v1
outputs:
  ai_provider_id:
    ref: Managed
```

Validate (creates nothing), then deploy:

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
  -d "$(jq -Rn --rawfile t provider.yaml '{name: "naturali-models", template: $t}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "ai_provider_id": "aip_NzjzJDzoId8cm1Hu" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- `default_model` must be a catalog `model` listed as `available`; it is the
  fallback for agents that name no model, and it picks which vendor serves
  this provider. Moving it to a model another source serves replaces the
  provider rather than editing it.
- One-time per project, not per model: models that join the catalog later are
  priced onto this provider automatically.
- To change it later, edit `provider.yaml`, `POST …/formations/plan` with
  `formation_id`, then `PUT …/formations/{formation_id}`.
- Only when the user asks for direct calls: `POST …/ai-providers` with
  `"provider": "naturali"` plus `name` and `default_model` (CLI
  `naturali create-ai-provider` · SDK `naturali.aiProviders.createAiProvider`).

```bash
export PROVIDER_FORMATION=form_EPis15Nfukary167
export PROVIDER=aip_NzjzJDzoId8cm1Hu
```

## 4. Validate it

CLI `naturali get-ai-provider-prices` · SDK `naturali.aiProviders.getAiProviderPrices`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/ai-providers/$PROVIDER/prices" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "prices": [{ "provider": "bedrock", "model": "nova-lite-v1",
    "component": "input_tokens", "unit": "token", "unit_price": 6.000000000000001e-8 }]
}
```

- One row per model per priced component (`input_tokens`, `output_tokens`,
  `cached_tokens` where priced), all with the same `provider`. `unit_price` is
  per token; the catalog quotes per 1K.
- Only models served the way `default_model` is are priced here; a model served
  another way (e.g. Gemini) needs a second provider whose `default_model` is
  one of them.
- An empty list means the provider was created but not priced: delete the
  formation (`DELETE …/formations/{formation_id}`, CLI `naturali delete-formation`
  · SDK `naturali.formations.deleteFormation`) and deploy again.

Done when `prices` holds a row for every managed model the provider's vendor
serves.

## Related skills

- `naturali-first-agent-generation` — create an agent on this provider and run it.
- `naturali-create-a-provider` — the bring-your-own-key path instead.
