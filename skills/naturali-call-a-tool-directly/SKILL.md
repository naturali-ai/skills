---
name: naturali-call-a-tool-directly
description: Invoke a naturali.ai tool with no agent and no model in the path (POST tools/{tool_id}/call) to tell a broken tool from a model calling a working one badly, read the target's real status, URL and body from the error meta, fix the tool in the formation template and prove the fix with the run that failed. Use when a tool call fails, an agent says a service is down, a tool result is error-text, to test a tool's URL, headers or mapping before binding it, or when a call answers 502 TOOL_HTTP_ERROR, 403 TOOL_EGRESS_BLOCKED, 422 TOOL_DISPATCH_FAILED or 422 for a client tool.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/debug-a-failed-run
---

# Call a tool directly

Outcome: a tool's own behaviour, isolated from the agent — a failure named
down to the target's status, URL and body — and a fix proven by the run that
failed.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- A tool in `naturali.yaml` bound to `Agent`, its id in `TOOL`, from
  `naturali-give-an-agent-an-http-tool`. The example is a health check whose
  URL is one segment off (`/v1/health`; the endpoint is `/health`).
- To debug a failed run, its failing call named first with
  `naturali-read-a-run` (the transcript's `tool_results[].error`).

Ids below are examples; use the ones your own calls return.

## 1. Call the tool

`input` is the tool's arguments, as the model would send them.

CLI `naturali call-tool` · SDK `naturali.tools.callTool`

```bash
curl -sS -X POST "https://api.naturali.ai/v1/projects/$PROJECT/tools/$TOOL/call" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "input": {} }'
```

`502`:

```json
{
  "error": {
    "code": "TOOL_HTTP_ERROR",
    "message": "Tool target returned HTTP 404: HTTP 404 GET https://api.naturali.ai/v1/health: …",
    "meta": {
      "tool_status_code": 404,
      "tool_response_body": "{\"error\":{\"code\":\"not_found\",\"message\":\"The resource does not exist.\"}}",
      "tool_url": "https://api.naturali.ai/v1/health",
      "tool_method": "GET"
    }
  }
}
```

The tool fails with no model involved, so the tool is at fault, not the
model; `meta` names the real status, the exact URL requested and the body the
target answered. A `200` answers the tool's raw output (any JSON value; `null`
when it produced none) — then the tool works and the model is calling it
badly.

| Answer | Meaning |
| --- | --- |
| `502 TOOL_HTTP_ERROR` | The `http` target answered non-2xx; `meta` carries what it said. |
| `403 TOOL_EGRESS_BLOCKED` | The target resolved to an address a tool may not reach (public internet only); `meta.tool_address` names it. |
| `422 TOOL_DISPATCH_FAILED` | A guardrail on the tool or project classed the call `C`, `D` or tripped a `B` guard — this route cannot wait for a person; `meta` has `tool_id` and `outcome`. |
| `422` | A `client` tool: there is no run to pause. |
| `400 VALIDATION_FAILED` | An `mcp` action outside the tool's `actions` allowlist. |
| `403 plan_limit_reached` (`resource: "runs"`) | Free plan out of runs: a direct call is a run (it spends no credit). |

- `http`, `mcp` and `pipeline` tools are supported. For `mcp`, `action` names
  the server tool to invoke.
- `preset_parameters` on the tool win over the same keys in `input`.
- `tool_context` (string map) is forwarded as context headers, narrowed by the
  tool's `context_keys`; `session_id`, `actor_id` and `actor_external_id` are
  dropped — this call has no session.

## 2. Fix the tool

Edit the tool in `naturali.yaml`; nothing about the agent changes — the
binding points at the tool, so the next run picks the fix up:

```yaml
resources:
  Health:
    type: tool
    properties:
      name: service-health
      type: http
      description: Reports whether the service is up.
      parameters: { type: object, properties: {} }
      execute:
        url: https://api.naturali.ai/health   # changed: was /v1/health
        method: GET
```

Apply it with `naturali-deploy-a-formation` (one `update` on the tool), then
repeat step 1: a `200` with the target's body proves the fix.

- Without a formation (only when the user asks): `PATCH …/tools/{tool_id}`
  with the new `execute` (CLI `naturali update-tool` · SDK
  `naturali.tools.updateTool`).

## 3. Prove the fix with the run that failed

Re-run the generation that failed, unchanged. Full options in
`naturali-run-a-generation`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "action_id": "tutorial.debug-a-failed-run",
        "messages": [{ "role": "user", "content": "Is the service up?" }]
      }'
```

```json
{
  "id": "gen_zRGfoMLIiMYDP1zp",
  "status": "completed",
  "output": {
    "finish_reason": "tool-calls",
    "response_messages": [
      { "role": "tool", "content": [{ "type": "tool-result", "toolName": "service-health",
          "output": { "type": "json", "value": { "status": "ok" } } }] }
    ]
  }
}
```

- `status` was `completed` before the fix too — a failing tool does not fail
  the run — so it is not the proof. The tool result is: `json` with the
  target's answer, where the failed run had `error-text`. In the transcript
  (`naturali-read-a-run`) the same call now has `result` and `error: null`.

Done when the direct call answers `200` and the re-run's tool result is `json`.

## Related skills

- `naturali-read-a-run` — find the failing call in a run's transcript before isolating it.
- `naturali-give-an-agent-an-http-tool` — declare and bind the tool, or force the call so a failure reproduces.
- `naturali-replay-a-turn` — re-answer a run that completed but answered badly.
