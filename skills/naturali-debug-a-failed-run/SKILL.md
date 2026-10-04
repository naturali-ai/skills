---
name: naturali-debug-a-failed-run
description: Declare a deliberately broken tool on a naturali.ai agent in a formation template, then find the root cause of the run whose tool call failed, down to the exact call, status, URL and response body, isolate the tool from the model with a direct tool call, fix it through a formation update and prove the fix with a run that succeeds. Use when a naturali agent run completed but answered wrongly or a tool returned an error, when asked to debug or troubleshoot a run, read a generation transcript for tool errors, call a tool directly, interpret TOOL_HTTP_ERROR or TOOL_EGRESS_BLOCKED, or find failed generations for an agent.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/debug-a-failed-run
---

# Debug a failed run

Outcome: the root cause of a failed agent run — named down to the exact call
that broke it — and a fix proven by the same run succeeding.

A failing tool does not fail the run: its error goes back to the model as the
tool's result and the run still ends `completed`. This breaks a run on purpose,
then works it like a production failure.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `NATURALI_API=https://api.naturali.ai/v1` — used by the curl calls below.
- `PROJECT`, `PROVIDER`, `FORMATION`, `AGENT` and its template `agent.yaml`
  (logical id `Agent`, parameter `ProviderId`), from
  `naturali-first-agent-generation`. This skill extends that template.
- `jq`, to put the template file into the JSON body.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Give the agent a tool that will fail

The URL is one segment off: `/v1/health` instead of `/health`, a `404` at call
time. Bind it with `tool_choice: "required"` so the failure reproduces on the
first try. Edit `agent.yaml`:

```yaml
resources:
  HealthTool:
    type: tool
    properties:
      name: service-health
      type: http
      description: Reports whether the service is up.
      parameters:
        type: object
        properties: {}
      execute:
        url: https://api.naturali.ai/v1/health
        method: GET
  Agent:
    properties:
      # …as before, plus:
      tool_bindings:
        - tool_id:
            ref: HealthTool
      tool_choice: required
      stop_conditions:
        - type: has_tool_call
          tool_name: service-health
outputs:
  tool_id:
    ref: HealthTool
```

- A forcing `tool_choice` must be paired with a `has_tool_call` stop condition
  naming a tool it can produce, or the write is refused.
- `tool_bindings` is the full set: list every tool the agent should keep.

Review the diff (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [
  { "logical_id": "Agent", "resource_type": "agent", "action": "update" },
  { "logical_id": "HealthTool", "resource_type": "tool", "action": "create" } ] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -sS -X PUT "$NATURALI_API/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_6aMJbsbQ6Y2jdl20", "tool_id": "tool_08HZFiGJhIE2VPGo" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- Only when the user asks for direct calls: `POST …/tools` with the same tool
  properties (CLI `naturali create-tool` · SDK `naturali.tools.createTool`),
  then `PATCH …/agents/{agent_id}` with `tool_bindings`, `tool_choice` and
  `stop_conditions` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

```bash
export TOOL=tool_08HZFiGJhIE2VPGo
```

## 2. Run it and read the error

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "action_id": "tutorial.debug-a-failed-run",
        "messages": [{ "role": "user", "content": "Is the service up?" }]
      }'
```

`200`:

```json
{
  "id": "gen_jOlNFyP9nMfqhPBq",
  "trace_id": "trace_yDTzcHKEA1G3pxp5",
  "status": "completed",
  "output": {
    "finish_reason": "tool-calls",
    "response_messages": [{ "role": "tool", "content": [{
      "type": "tool-result", "toolName": "service-health",
      "output": { "type": "error-text", "value": "HttpToolError: HTTP 404 GET https://api.naturali.ai/v1/health: …" } }] }]
  }
}
```

- `status: "completed"`, yet the tool result is `error-text`: the tool failed,
  the run did not.

```bash
export GENERATION=gen_jOlNFyP9nMfqhPBq
export TRACE=trace_yDTzcHKEA1G3pxp5
```

- In production you will not hold these ids: list
  `GET /v1/projects/{project_id}/generations` by `agent_id`. `status=failed`
  catches runs that stopped on an error (e.g. a provider failure); a run whose
  tool failed ends `completed` and is found by reading its transcript. Each row
  carries `id` and `trace_id`.
- A failed agent run does **not** file an exception, so an empty exceptions
  list is no evidence your agent runs are healthy.

## 3. Read the run's record

CLI `naturali get-generation` · SDK `naturali.generations.getGeneration`

```bash
curl -sS "$NATURALI_API/projects/$PROJECT/generations/$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "gen_jOlNFyP9nMfqhPBq", "agent_version": 2, "status": "completed",
  "stop_reason": "tool-calls", "error": null, "action_id": "tutorial.debug-a-failed-run" }
```

- `error` is set only when the run itself stops on a failure (e.g. `code`
  `AI_PROVIDER_ERROR`), not when a tool inside it fails. `agent_version` pins a
  failure to the version that introduced it.
- In a multi-agent run, fetch `GET /v1/projects/{project_id}/traces/{trace_id}/tree`;
  the node carrying an `error` is the one that failed.

The tool's failure is in the transcript.

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl -sS \
  "$NATURALI_API/projects/$PROJECT/generations/$GENERATION/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Accept: application/json'
```

```json
{
  "agent_version": 2,
  "status": "completed",
  "steps": [{
    "index": 0,
    "tool_calls": [{ "id": "tooluse_7KnRKOeqjEVM4dBnASMvBm", "tool_name": "service-health", "args": {} }],
    "tool_results": [{
      "tool_call_id": "tooluse_7KnRKOeqjEVM4dBnASMvBm",
      "tool_name": "service-health",
      "result": null,
      "error": {
        "name": "HttpToolError",
        "status": 404,
        "url": "https://api.naturali.ai/v1/health",
        "method": "GET",
        "body": "{\"error\":{\"code\":\"not_found\",\"message\":\"The resource does not exist.\"}}"
      }
    }]
  }]
}
```

- The matching `tool_results` entry names the broken call: `result: null`, and
  an `error` with the target's `status`, exact `url` and `method`, and `body`.
- Empty `steps`? Check `content_redacted_at`: the content was never stored or
  was purged.

## 4. Isolate the tool from the agent

Calling the tool directly — no agent, no model — tells a broken tool from a
model calling a working tool badly.

CLI `naturali call-tool` · SDK `naturali.tools.callTool`

```bash
curl -sS -X POST "$NATURALI_API/projects/$PROJECT/tools/$TOOL/call" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "input": {} }'
```

`502`:

```json
{
  "error": {
    "code": "TOOL_HTTP_ERROR",
    "meta": {
      "tool_status_code": 404,
      "tool_response_body": "{\"error\":{\"code\":\"not_found\",\"message\":\"The resource does not exist.\"}}",
      "tool_url": "https://api.naturali.ai/v1/health",
      "tool_method": "GET"
    }
  }
}
```

Root cause: the tool fails with no model involved; `/v1/health` does not
exist — the endpoint is `/health`.

- `403 TOOL_EGRESS_BLOCKED` means something else: the target resolved to an
  address a tool may not reach (public internet only, unless the deployment
  lists the destination).

## 5. Fix it and prove the fix

The binding points at the tool, so fixing the tool fixes the agent. In
`agent.yaml`, change the tool's `execute`:

```yaml
resources:
  HealthTool:
    properties:
      # …as in step 1, with:
      execute:
        url: https://api.naturali.ai/health
        method: GET
```

Plan and update with the same two calls as step 1; the plan shows `update` on
`HealthTool` only.

- Only when the user asks for direct calls: `PATCH …/tools/{tool_id}` with the
  new `execute` (CLI `naturali update-tool` · SDK `naturali.tools.updateTool`).

Re-run the step 2 generation unchanged.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "$NATURALI_API/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "action_id": "tutorial.debug-a-failed-run",
        "messages": [{ "role": "user", "content": "Is the service up?" }]
      }'
```

```json
{ "id": "gen_zRGfoMLIiMYDP1zp", "status": "completed",
  "output": { "response_messages": [{ "role": "tool", "content": [{ "type": "tool-result",
    "toolName": "service-health", "output": { "type": "json", "value": { "status": "ok" } } }] }] } }
```

CLI `naturali get-generation-transcript` · SDK `naturali.generations.getGenerationTranscript`

```bash
curl -sS \
  "$NATURALI_API/projects/$PROJECT/generations/gen_zRGfoMLIiMYDP1zp/transcript" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Accept: application/json'
```

```json
{ "steps": [{ "tool_results": [{ "tool_name": "service-health", "result": { "status": "ok" }, "error": null }] }],
  "output": { "content": null, "finish_reason": "tool-calls" } }
```

Done when the same call that carried an `error` now has `result:
{ "status": "ok" }` and `error: null` — `status` was `completed` both times, so
it is not the proof.

- `output.content` is `null` because the `has_tool_call` stop condition ends
  the turn at the tool call. Drop it and set `tool_choice` back to `"auto"` for
  the agent to answer in its own words.

## Related skills

- `naturali-replay-a-bad-answer` — a run that completed but answered badly, fixed on its own history.
- `naturali-score-an-agent-change` — keep the fix in place as a test case.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
