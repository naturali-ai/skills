---
name: naturali
description: Build, run and audit AI agents on naturali.ai over its REST API, CLI, TypeScript SDK or MCP server. Use when a task involves naturali.ai, an agent that must answer on WhatsApp or Discord, grounding an agent in uploaded documents, gating it with guardrails or human approvals, scoring a change with evals, or reading back what an agent generated and what it cost.
license: Apache-2.0
metadata:
  author: naturali.ai
  homepage: https://naturali.ai
  openapi: https://naturali.ai/openapi.json
---

# naturali.ai

naturali.ai is one API for the whole lifecycle of an agent: configure and
version it, give it knowledge and tools, put it on WhatsApp or Discord, and read
back every generation it ran with its cost and the decisions behind it. The
app, the CLI and the TypeScript SDK are thin clients over the same OpenAPI
contract, so anything a person can do an agent can do over HTTP.

Reach for this when the job is to **operate** an agent, not to make one model
call. For a single completion against a single model, a vendor's own API is
simpler.

## Ground truth

Read these before guessing at a path or a field. Everything else in this file is
a summary of them.

- <https://naturali.ai/openapi.json> — the whole `v1` contract, one OpenAPI
  3.0.3 document. Every operation has a unique `operationId`, typed schemas and
  a typed error body.
- <https://naturali.ai/llms.txt> — what the product is and when to use it.
- <https://docs.naturali.ai/llms-full.txt> — every module guide and tutorial
  inlined. Any docs page is Markdown when `.md` is appended to its URL.
- <https://naturali.ai/pricing.md> — plans and how model credits work.

## Authenticate

Base URL `https://api.naturali.ai`; every path carries the `/v1` prefix.

```
Authorization: Bearer <token>
```

The token is a project API key (`nat_sk_…`) minted in the app at
<https://app.naturali.ai>, or a session token from the auth module. Most
resources live under a project: `/v1/projects/{project_id}/…`. Every project
resource needs the `member` role; `admin` covers membership, project settings
and pause.

Errors are `{ "error": { "code", "message", "details" or "meta" } }`; a run's
error carries `generation_id` and `trace_id` in `meta`. A `402
insufficient_credit` means the account's prepaid balance is negative; a `403
plan_limit_reached` or `plan_feature_not_included` names the plan ceiling hit;
a `429` from an enforced quota carries `Retry-After` in seconds, as does
`429 too_many_requests` past 3,000 requests per IP address in 5 minutes.

## The shape of every task

1. **Project.** `POST /v1/projects`, or list the caller's with
   `GET /v1/projects`. Everything below is scoped to its id.
2. **Model.** Either enable the managed offering
   (`POST /v1/projects/{project_id}/ai-providers` with `provider: "naturali"`
   and a `default_model`) or register the caller's own credential: store it as
   a secret, then create an `ai-provider` pointing at it. `GET /v1/models` lists
   the managed catalog; a model has one public name, `model`.
3. **Agent.** `POST /v1/projects/{project_id}/agents` with an `ai_provider_id`
   (or `model_route_id`), `instructions`, and optionally `tool_bindings` and
   `knowledge_config` (which also names memory stores). Agents are
   versioned: an update is a new version, and a release is promoted, not edited.
4. **Generate.** `POST /v1/projects/{project_id}/agents/{agent_id}/generate`
   with `messages`; it answers `202` and runs in the background, or add
   `?wait=true` for the result inline. For a multi-turn thread use `conversations` or `sessions`
   and pass `agent_id` in the body.
5. **Read back.** `GET …/generations/{generation_id}` for status and cost;
   `…/transcript` for the answer and each tool call; `activity`, filtered by
   `generation_id`, for the approvals and actions behind it; `audit-log` for
   the project-wide record.

Minimal generation:

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What is our refund window?" }] }'
```

## Modules, by what they are for

| Need | Module(s) | Notes |
| --- | --- | --- |
| Answer from documents | `files`, `documents`, `ingestion-rules`, `knowledge` | Upload, let ingestion chunk and embed, attach the knowledge base to the agent; `knowledge/search` queries it directly |
| Call external systems | `tools`, `secrets` | HTTP and MCP tools; credentials as secrets, referenced by id |
| Remember across conversations | `memory-stores`, `memories` | Attach a memory store to the agent |
| Talk to people | `channels`, `channel-routes`, `addresses` | WhatsApp and Discord; routing by identifier; erasure per address |
| Gate what an agent may do | `guardrails`, `approvals`, `exceptions` | Guardrails evaluate every attached action; an approval parks a generation until a human answers |
| Prove a change | `evaluations` (`datasets`, `evals`) | Score a version against a dataset before promoting it |
| Automate | `workflows`, `tasks`, `orchestrations`, `triggers` | Triggers fire on a schedule, an event or a manual fire; orchestrations run multi-step graphs |
| Bound spend | `quotas` | The caller's own caps on requests, tokens or `cost_usd`; enforced with a `429` |
| Failover | `model-routes` | Ordered fallback across providers |
| Provision everything at once | `formations` | Declare resources in one template; `plan` before `create` |

## Clients

- CLI: `npm install -g @naturali/cli`, then `naturali --help`. Every route is a
  command named after its `operationId`, e.g. `naturali create-agent-generation`.
- SDK: `npm install @naturali/sdk`; `new NaturaliClient({ token })`, methods
  grouped by module (`naturali.agents.createAgentGeneration(...)`).
- MCP: `https://api.naturali.ai/mcp`, Streamable HTTP, OAuth 2.0 with PKCE and
  dynamic client registration. Every REST operation is reachable by name through the `search`,
  `describe` and `call` tools.

## Rules of thumb

- Prefer the ids the API returns over anything remembered; list before you
  assume.
- Do not send `project_id` in a body when it is already in the path.
- A generation that needs a tool result the platform cannot produce stops with
  a pending tool call; hand the output back on the `tool-outputs` route.
- Read the generation and its trace before deciding a run failed for the reason
  you expect.
