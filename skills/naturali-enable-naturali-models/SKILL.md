---
name: naturali-enable-naturali-models
description: Give a naturali.ai project every naturali-managed model with no vendor account or credential - list the model catalog and its prices, declare one naturali_ai_provider as Provider in naturali.yaml, and prove it is priced for every model it serves. Use when asked to use naturali models, managed models or the catalog, set up a provider with no API key, list available models or their prices, create a provider naturali, or when a deploy fails with catalog_not_ready, managed_source_unavailable or 400 bad_request on a model from another source.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/enable-naturali-models
---

# Enable naturali models

Outcome: a `Provider` in the project that generates on naturali's own model
access, priced and metered for every catalog model its source serves.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id,
  from `naturali-create-a-project`.
- `naturali.yaml`, applied with `naturali-deploy-a-formation`.
- Bringing your own vendor key instead? Use
  `naturali-bring-your-own-model-key`; a project can use both.

Ids below are examples; use the ones your own calls return.

## 1. See what naturali offers

The catalog is the same for every project, synced daily against each source's
listing and published prices.

CLI `naturali list-models` · SDK `naturali.models.listModels`

```bash
curl -sS -G https://api.naturali.ai/v1/models \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d status=available
```

```json
{
  "data": [
    {
      "model": "nova-lite-v1",
      "vendor": "amazon",
      "input_modalities": ["text", "image", "video"],
      "output_modalities": ["text"],
      "status": "available",
      "pricing": { "currency": "usd", "input_per_1k_tokens": 0.00006, "output_per_1k_tokens": 0.00024 }
    }
  ],
  "next_cursor": "Z3B0LW9zcy1zYWZlZ3VhcmQtMjBi"
}
```

- Paginated: pass `next_cursor` back as `cursor` until it is `null`. Other
  filters: `vendor`, `modality`.
- `model` is the one name used everywhere a model is named — a provider's
  `default_model`, an agent's `model`. `pricing` is per 1K tokens.
- A model naturali cannot price, or one that does not output text, is not
  listed; reach it with `naturali-bring-your-own-model-key`.

## 2. Declare the provider

Add to `naturali.yaml`:

```yaml
resources:
  Provider:
    type: naturali_ai_provider
    properties:
      name: naturali
      default_model: nova-lite-v1
outputs:
  ai_provider_id:
    ref: Provider
```

Apply it with `naturali-deploy-a-formation`. The plan for a new formation shows
`{ "logical_id": "Provider", "resource_type": "naturali_ai_provider", "action": "create" }`.

```bash
export PROVIDER=aip_NzjzJDzoId8cm1Hu   # outputs.ai_provider_id
```

- Two properties only. `secret_id`, `config` and `base_url` are refused, not
  ignored: it runs on naturali's access. `name` defaults to `naturali` (or
  `naturali-vertex` for a Vertex-served model).
- `default_model` must be a catalog `model` listed `available` (the vendor's own
  invocation string is refused). It is the fallback for agents that name no
  model, and it decides which source serves the provider — you never name the
  source.
- One provider per source. An agent or route target naming a model of another
  source is `400 bad_request` (`details.model`, `source`, `provider_source`);
  add a second `naturali_ai_provider` whose `default_model` is from that source.
- Moving `default_model` to another source replaces the provider (new id, every
  `ref` re-pointed); a rename or a same-source model is an in-place update.
- One-time per project: models that join the catalog later are priced onto the
  same provider automatically.
- `catalog_not_ready` (catalog not synced yet) and `managed_source_unavailable`
  (that model's source is not configured here) are not a wrong value: retry
  later, or pick a model from another source.
- Without a formation (only when the user asks): `POST …/ai-providers` with
  `"provider": "naturali"`, `name` and `default_model` (CLI
  `naturali create-ai-provider` · SDK `naturali.aiProviders.createAiProvider`).

## 3. Prove it is priced

CLI `naturali get-ai-provider-prices` · SDK `naturali.aiProviders.getAiProviderPrices`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/ai-providers/$PROVIDER/prices" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "prices": [
    {
      "ai_provider_id": "aip_NzjzJDzoId8cm1Hu",
      "meter_type": "llm_tokens",
      "provider": "bedrock",
      "model": "nova-lite-v1",
      "component": "input_tokens",
      "unit": "token",
      "unit_price": 6.000000000000001e-8
    }
  ]
}
```

- One row per model per priced component (`input_tokens`, `output_tokens`,
  `cached_tokens` where priced), all the same `provider`. `unit_price` is per
  token; the catalog quotes per 1K.
- Only models of the same source as `default_model` are priced here (Gemini,
  for example, needs a second provider).
- An empty list means the provider exists but was never priced: remove
  `Provider` from the template, apply, add it back and apply again.
- The price book is read-only: `PUT …/prices` on a managed provider is `403
  managed_price_book_read_only`.

Done when `prices` holds rows for the models you plan to use.

## Related skills

- `naturali-create-an-agent` — an agent on `Provider`.
- `naturali-run-a-generation` — prove a model answers.
- `naturali-bring-your-own-model-key` — your own credential instead, or beside it.
- `naturali-deploy-a-formation` — apply the template.
