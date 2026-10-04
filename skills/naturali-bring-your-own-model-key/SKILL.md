---
name: naturali-bring-your-own-model-key
description: Use your own model vendor credential (OpenAI, Anthropic, Google, Bedrock, Vertex, Azure, Groq, xAI, a gateway or a self-hosted endpoint) in a naturali.ai project - declare it as a write-only secret and an ai_provider named Provider in naturali.yaml, then prove the credential works by listing the models it can run. Use when asked to bring your own key (BYOK), add an OpenAI or other vendor API key, store a model credential, rotate a vendor key, check which models a key can reach, or when a provider answers 502 MODEL_LISTING_FAILED, 400 MODEL_LISTING_UNSUPPORTED or a 400 for a bedrock or vertex provider without a credential.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/create-a-provider
---

# Bring your own model key

Outcome: a `Provider` that generates on your own vendor credential, proven by
the vendor answering with the models that credential can run.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id,
  from `naturali-create-a-project`.
- A vendor key, here `OPENAI_API_KEY`.
- `naturali.yaml`, applied with `naturali-deploy-a-formation`.
- No vendor account? Use `naturali-enable-naturali-models` instead.

Ids below are examples; use the ones your own calls return.

## 1. Declare the secret and the provider

Add to `naturali.yaml`:

```yaml
parameters:
  OpenAiKey:
    type: string
    no_echo: true
    use_previous_value: true
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
  ai_provider_id:
    ref: Provider
```

Apply it with `naturali-deploy-a-formation`, sending
`parameters: {OpenAiKey: $OPENAI_API_KEY}` on the create. With
`use_previous_value`, later updates may omit the key.

```bash
export PROVIDER=aip_JPvMSUTATh7C6Bn6   # outputs.ai_provider_id
```

- The secret is write-only: no endpoint reads the value back (a read shows
  `has_value: true`; the formation's template shows `{ "no_echo": true }`).
- `provider` is one of `openai`, `anthropic`, `google`, `xai`, `groq`,
  `ollama`, `azure`, `bedrock`, `vertex`, `gateway`, `custom`, written as a
  literal or a parameter carrying one; a `ref` or `sub` there is `400
  bad_request`.
- `default_model` and an agent's `model` take the vendor's own model ids.
- `bedrock` and `vertex` must carry their own credential — `secret_id` (a
  `ref` to a `secret` counts) or an express-mode `config.apiKey` — or the
  create is `400`.
- A vendor that needs no credential (a local `ollama`) takes `base_url` and no
  `secret_id`.
- The provider is created whether or not the key works; nothing calls the
  vendor until step 2.
- Without a formation (only when the user asks): `POST …/secrets` with `name`
  and `value` (CLI `naturali create-secret` · SDK `naturali.secrets.createSecret`),
  then `POST …/ai-providers` with its `secret_id` (CLI
  `naturali create-ai-provider` · SDK `naturali.aiProviders.createAiProvider`).

## 2. Prove the credential works

The vendor is asked with this provider's own credential, so a `200` proves
secret, provider and vendor together.

CLI `naturali list-ai-provider-models` · SDK `naturali.aiProviders.listAiProviderModels`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/ai-providers/$PROVIDER/models" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "provider": "openai", "models": [{ "id": "gpt-4o-mini" }, { "id": "gpt-4o" }, { "id": "o3-mini" }] }
```

- Each `id` is usable as `default_model` or an agent's `model`. Pinning one not
  listed fails at generation time.
- A key the vendor rejects is `502`:
  `{ "error": { "code": "MODEL_LISTING_FAILED", "message": "The openai provider rejected the model listing request (HTTP 401)." } }`.
  Rotate it: apply the same template with the new `OpenAiKey` parameter; the
  provider keeps its id.
- `azure` and `ollama` cannot list (`400 MODEL_LISTING_UNSUPPORTED`), nor can a
  Vertex key in express mode; prove those with one generation instead
  (`naturali-run-a-generation`).
- On your own key the vendor bills the tokens, so a generation's `cost_usd`
  can be `null`.

Done when the listing answers `200` and includes the model the agent will use.

## Related skills

- `naturali-create-an-agent` — an agent on `Provider`.
- `naturali-run-a-generation` — prove a model answers.
- `naturali-enable-naturali-models` — managed models with no credential, beside or instead.
- `naturali-deploy-a-formation` — apply the template, pass and rotate parameters.
