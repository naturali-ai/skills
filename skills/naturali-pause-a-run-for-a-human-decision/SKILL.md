---
name: naturali-pause-a-run-for-a-human-decision
description: Add a reply tool and an approval step to a naturali.ai orchestration's formation template and update the formation so every reply waits for a person, start a run that parks as awaiting_input, read the frozen proposal, approve or reject it, and confirm the send step ran only after the decision. Use when asked to add human-in-the-loop review, a sign-off step or an approval node to a naturali orchestration, hold a run until someone approves, approve, edit or reject a pending approval, or check why an orchestration run is awaiting_input.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/pause-a-run-for-a-human-decision
---

# Pause a run for a human decision

Outcome: an orchestration that holds every reply until a person approves it —
proven by a run that waits as `awaiting_input`, an approval you grant, and a
send step that runs only after it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT`, `PROVIDER`, `FORMATION`, `ORCHESTRATION` and its template
  `support-reply.yaml` (orchestration logical id `Pipeline`, nodes `research` →
  `draft` → `review`, parameter `ProviderId`), from
  `naturali-orchestrate-several-agents`. This skill extends that template.
- `jq`, to put the template file into the JSON body.
- Approvals need the **Pro** plan or above (the project owner's plan). Below
  it, listing approvals answers `403 plan_feature_not_included`; reading,
  approving and rejecting an existing approval answer on every plan.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create the tool that sends the reply

An `approval` step reviews a proposed call to a tool. This `http` tool posts to
`httpbin.org`, which echoes back, so nothing reaches a customer. Add to
`support-reply.yaml` under `resources`:

```yaml
  SendReply:
    type: tool
    properties:
      name: send-reply
      type: http
      description: Sends a reply to the customer.
      parameters:
        type: object
        properties:
          reply: { type: string }
        required: [reply]
      execute:
        url: https://httpbin.org/post
        method: POST
```

- Only when the user asks for direct calls: `POST …/tools` with the same
  properties as the body (CLI `naturali create-tool` · SDK
  `naturali.tools.createTool`).

## 2. Add the approval step

Two nodes go after `review`:

- `approve` (`type: approval`) freezes the proposed call — tool plus
  `arguments` resolved from run state — onto an approval item and parks the
  run. It does not call the tool. `instructions` is what the approver reads;
  `reasoning` is why the step exists.
- `send` (`type: tool`) calls `send-reply` with the reviewed reply, on an edge
  with `condition: approved`.

Append to `Pipeline`'s `nodes` and `edges`:

```yaml
      nodes:
        # …research, draft, review as before, then:
        - id: approve
          type: approval
          tool_id: { ref: SendReply }
          arguments: { reply: { var: reply } }
          reasoning: Every reply is checked by a person before it reaches the customer.
          instructions: Approve to send this reply as written, or reject with a reason.
          expires_in: 3600
        - id: send
          type: tool
          tool_id: { ref: SendReply }
          input_mapping: { reply: { var: reply } }
          state_mapping: { sent: { var: output } }
      edges:
        # …research → draft → review as before, then:
        - { from: review, to: approve }
        - { from: approve, to: send, condition: approved }
```

Review the diff (creates nothing), then apply it:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-reply.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [
  { "logical_id": "SendReply", "resource_type": "tool", "action": "create" },
  { "logical_id": "Pipeline", "resource_type": "orchestration", "action": "update" } ] }
```

The three agents plan as `no-op`.

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t support-reply.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "orchestration_id": "orch_avQnhq18EzeQQPWh" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- An `update` (not `replace`) in the plan keeps `ORCHESTRATION`; it becomes
  version 2, and a run already in flight keeps the version it started on.
- Only when the user asks for direct calls: read the orchestration, append the
  two nodes (with the tool's real id) and edges, and `PATCH
  …/orchestrations/{orchestration_id}` with the full `nodes` and `edges` (CLI
  `naturali update-orchestration` · SDK
  `naturali.orchestrations.updateOrchestration`).

## 3. Start a run — it waits

`"wait": true` holds the request until the run settles **or parks**.

CLI `naturali start-orchestration-run` · SDK `naturali.orchestrations.startOrchestrationRun`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"orchestration_id\": \"$ORCHESTRATION\",
    \"wait\": true,
    \"input\": {
      \"question\": \"Can I get a refund on a cake I picked up yesterday?\",
      \"policy\": \"Custom cakes: refunds within 48 hours of pickup, with the receipt. Bread and pastries: no refunds, same-day exchanges only. Refunds go back to the original payment method within 5 business days.\"
    }
  }"
```

```json
{
  "id": "orch_run_ZEDKoD4bqvdEyFXH",
  "orchestration_version": 2,
  "status": "awaiting_input",
  "active_nodes": ["approve"],
  "required_action": {
    "type": "approval",
    "node_id": "approve",
    "prompt": "Approve to send this reply as written, or reject with a reason.",
    "context": { "reply": "Yes, custom cakes are eligible for refunds, but …" },
    "approval_id": "apr_KJkOcEAZOXkkNmIj",
    "expires_at": "2026-10-03T10:34:12.371Z"
  },
  "output": null
}
```

```bash
export RUN=orch_run_ZEDKoD4bqvdEyFXH
export APPROVAL=apr_KJkOcEAZOXkkNmIj
```

- `required_action` says why the run is parked. Nothing has been sent.
- Past `expires_at` (`expires_in: 3600`) the item can never be approved.

## 4. Read the proposal

The approver sees the item, not the run. Without the id, find it with
`GET /v1/projects/{project_id}/approvals?status=pending`.

CLI `naturali get-approval` · SDK `naturali.approvals.getApproval`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "apr_KJkOcEAZOXkkNmIj",
  "origin": "node",
  "status": "pending",
  "proposed_action": { "tool_id": "tool_0WdZqOGBrRPdEPS6", "arguments": { "reply": "Yes, custom cakes are eligible for refunds, but …" } },
  "orchestration_run_id": "orch_run_ZEDKoD4bqvdEyFXH",
  "node_id": "approve",
  "resolved_by": null
}
```

## 5. Approve it

Settles the item and hands the run back; it follows the `approved` edge into
`send`.

CLI `naturali approve-approval` · SDK `naturali.approvals.approveApproval`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL/approve" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "apr_KJkOcEAZOXkkNmIj", "status": "approved", "resolved_by": "user_7x9yZtYrtTbPXbx0", "edited_arguments": null }
```

- To change the reply before it goes out, pass the edited call:
  `--arguments '{"reply": "…"}'` or `body: { arguments: { reply: '…' } }`. The
  item keeps both versions.
- Rejecting instead requires a `reason`:

CLI `naturali reject-approval` · SDK `naturali.approvals.rejectApproval`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL/reject" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Offer the same-day exchange instead." }'
```

- A rejected run still finishes `succeeded`: `send` is `skipped`, the `approve`
  output carries `"decision": "rejected"` and the reason, and `output.reply`
  still holds the unsent reply — read the decision, never assume it was sent.
  Branch with an edge `"condition": "rejected"`, or `"expired"`.

## 6. Read the run back

CLI `naturali get-orchestration-run` · SDK `naturali.orchestrations.getOrchestrationRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "orch_run_ZEDKoD4bqvdEyFXH",
  "status": "succeeded",
  "required_action": null,
  "node_executions": [
    { "node_id": "approve", "node_type": "approval", "status": "completed",
      "output": { "decision": "approved", "approvalId": "apr_KJkOcEAZOXkkNmIj",
                  "resolvedBy": "user_7x9yZtYrtTbPXbx0", "editedArgs": null, "reason": null } },
    { "node_id": "send", "node_type": "tool", "status": "completed",
      "input": { "reply": "Yes, custom cakes are eligible for refunds, but …" },
      "output": { "url": "https://httpbin.org/post", "json": { "reply": "Yes, custom cakes are eligible for refunds, but …" } } }
  ]
}
```

Done when the run has gone from `awaiting_input` to `succeeded` with
`required_action: null`, the `approve` step records `"decision": "approved"`
and who made it, and `send` ran after it with the reviewed reply echoed back in
`json`.

## Related skills

- `naturali-gate-a-tool-with-guardrails` — hold only the risky calls, decided per call by a guardrail.
- `naturali-orchestrate-several-agents` — build the support-reply orchestration this extends.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
