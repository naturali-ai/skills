---
name: naturali-create-a-project
description: Create a naturali.ai project - the tenancy boundary every provider, secret, agent and formation lives in - with one POST /v1/projects call, and export its id as PROJECT. Use when starting on naturali from scratch, when asked to create, set up or name a naturali project or environment, when no PROJECT id is known yet, or when creating one answers 403 access_denied (project-scoped key) or 403 plan_limit_reached (project cap).
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/enable-naturali-models
---

# Create a project

Outcome: a project you own and pay for, its id exported as `PROJECT`, ready
for `naturali.yaml` to be deployed into.

## Before you start

- `NATURALI_TOKEN` — an **account**-scoped `nat_sk_…` API key (or a session
  JWT). A project-scoped key cannot create a project: the call answers `403
  access_denied`. With one, skip this skill and export the `PROJECT` it is
  scoped to.
- A client, if not plain curl: CLI `pnpm add -g @naturali/cli` (reads
  `NATURALI_TOKEN` from the environment), or SDK `pnpm add @naturali/sdk` with
  `new NaturaliClient({ token: process.env.NATURALI_TOKEN })`.

Ids below are examples; use the ones your own calls return.

## 1. Find an existing project first

A key may already reach the project you want (a project-scoped key lists only
its own).

CLI `naturali list-projects` · SDK `naturali.projects.listProjects`

```bash
curl -sS https://api.naturali.ai/v1/projects \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

## 2. Create it

A project is not declarable in a template, so this is always a direct call.

CLI `naturali create-project --name "getting started"` · SDK `naturali.projects.createProject`

```bash
curl -sS -X POST https://api.naturali.ai/v1/projects \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "getting started" }'
```

```json
{
  "id": "proj_V1StGXR8Z5jdHi6B",
  "name": "getting started",
  "role": "owner",
  "owner_user_id": "user_V1StGXR8Z5jdHi6B",
  "status": "active"
}
```

```bash
export PROJECT=proj_V1StGXR8Z5jdHi6B
```

- You are its `owner` (may do anything, including delete it) and its billing
  owner: every member's usage is paid from your account.
- One project per client or per environment. Providers, secrets, agents and
  everything else belong to exactly one, and your credential is authorized
  against it on every request.
- `403 plan_limit_reached` (`details.plan`, `details.limit`): your plan's
  project cap. An archived project still counts; deleting one frees a slot.
- `idempotency_key` in the body makes a retry safe: the same key answers `200`
  with the original project; reused with a different body it is `409
  idempotency_key_reused`.
- A new project starts at your plan's content-retention window
  (`trace_content_retention_days`).

Done when the response has `"status": "active"` and `"role": "owner"`.

## Related skills

- `naturali-enable-naturali-models` — give the project managed models, no vendor key.
- `naturali-bring-your-own-model-key` — or use your own vendor credential.
- `naturali-deploy-a-formation` — deploy `naturali.yaml` into the project.
- `naturali-invite-a-colleague` — add members to it.
