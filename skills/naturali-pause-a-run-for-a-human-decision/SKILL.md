---
name: naturali-pause-a-run-for-a-human-decision
description: Add an approval step to a naturali.ai orchestration so each run parks as awaiting_input until a person approves the proposed tool call. Use when asked to add human-in-the-loop or an approval node to an orchestration, hold a reply or tool call for review before it is sent, route on approved, rejected or expired, read required_action on an awaiting_input run, or check what a parked run did after approval.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/pause-a-run-for-a-human-decision
---

# Pause a run for a human decision

Outcome: the `support-reply` orchestration holds every reply until a person
approves it, proven by a run that waits as `awaiting_input`, an approval you
grant, and a send step that runs only after it.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Pipeline` (the support-reply orchestration) in `naturali.yaml`, from
  `naturali-orchestrate-several-agents`, deployed as `$FORMATION`;
  `ORCHESTRATION` — its id.
- `SendReply` in `naturali.yaml`: an `http` tool named `send-reply` taking a
  required string `reply`, POSTing to `https://httpbin.org/post` (which echoes
  the request, so nothing reaches a customer). Declare it as in
  `naturali-give-an-agent-an-http-tool`, without binding it to an agent.
- Approvals are a Pro-and-above feature: on a lower plan, listing approvals is
  `403 plan_feature_not_included`. Reading, approving and rejecting an existing
  approval work on every plan, so a run is never left waiting on a decision
  nobody may make. The plan is the project owner's, not the caller's.

Ids below are examples; use the ones your own calls return.

## 1. Add the approval step

Two nodes go after `review`:

- `approve` (`type: approval`) freezes the proposed call — the tool and its
  `arguments`, resolved from the run's state — onto an approval item and parks
  the run until someone decides. It never calls the tool itself.
  `instructions` is what the approver reads; `reasoning` is why the step
  exists; `expires_in` is seconds (default 86400).
- `send` (`type: tool`) calls `send-reply` with the reviewed reply.

The edge into `send` carries `condition: approved`, so it is followed only on
an approval. Edit `Pipeline` in `naturali.yaml`:

```yaml
resources:
  Pipeline:
    type: orchestration
    properties:
      name: support-reply
      nodes:
        - id: research
          type: agent
          agent_id: { ref: Researcher }
          input_mapping:
            question: { var: input.question }
            policy: { var: input.policy }
          state_mapping: { facts: { var: output.content } }
        - id: draft
          type: agent
          agent_id: { ref: Writer }
          input_mapping:
            question: { var: input.question }
            facts: { var: facts }
          state_mapping: { draft: { var: output.content } }
        - id: review
          type: agent
          agent_id: { ref: Reviewer }
          input_mapping:
            facts: { var: facts }
            draft: { var: draft }
          state_mapping: { reply: { var: output.content } }
        - id: approve                                   # added
          type: approval
          tool_id: { ref: SendReply }
          arguments: { reply: { var: reply } }
          reasoning: Every reply is checked by a person before it reaches the customer.
          instructions: Approve to send this reply as written, or reject with a reason.
          expires_in: 3600
        - id: send                                      # added
          type: tool
          tool_id: { ref: SendReply }
          input_mapping: { reply: { var: reply } }
          state_mapping: { sent: { var: output } }
      edges:
        - { from: research, to: draft }
        - { from: draft, to: review }
        - { from: review, to: approve }                      # added
        - { from: approve, to: send, condition: approved }   # added
      output_mapping:
        reply: { var: state.reply }
```

Apply it with `naturali-deploy-a-formation`; the plan reports:

```json
{ "changes": [{ "logical_id": "Pipeline", "resource_type": "orchestration", "action": "update" }] }
```

The id is kept and the orchestration moves to `version` 2; version 1 is
archived, and a run already in flight keeps the version it started on.

- Without a formation (only when the user asks): `PATCH …/orchestrations/{orchestration_id}`
  with the full `nodes` and `edges` — it replaces both (CLI
  `naturali update-orchestration` · SDK `naturali.orchestrations.updateOrchestration`).

## 2. Start a run — it waits

With `"wait": true` the request is held until the run settles **or parks**, so
it returns once the three agents have written the reply and `approve` is
waiting.

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
    "context": { "reply": "Yes, custom cakes are eligible for refunds, but you must request one within 48 hours of pickup. …" },
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

- `required_action.type` says what the run waits for (`approval` here; also
  `human_input`, `webhook_receive` or `paused`). Nothing has been sent yet.
- Past `expires_at` the item can never be approved; route that case with an
  edge carrying `condition: expired`.
- For an answer rather than a yes/no, a `human` node parks the run with a
  `prompt` and optional `options`, answered with
  `POST …/orchestration-runs/{orchestration_run_id}/human-input` (CLI
  `naturali submit-human-input` · SDK `naturali.orchestrations.submitHumanInput`).

## 3. Settle the approval

Read the proposal and approve it (optionally with edited `arguments`) or reject
it with a reason, with `naturali-settle-an-approval`. Approving hands the run
back and it follows the `approved` edge into `send`.

- A rejection still finishes the run `succeeded` without calling the tool:
  `send` is `skipped`, the `approve` step's output carries
  `"decision": "rejected"` and the reason, and `output.reply` still holds the
  reply nobody sent. Read the decision; never assume a reply went out.
- To act on a rejection, add an edge from `approve` with
  `condition: rejected`.

## 4. Read the run back

CLI `naturali get-orchestration-run` · SDK `naturali.orchestrations.getOrchestrationRun`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/orchestration-runs/$RUN" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "status": "succeeded",
  "required_action": null,
  "output": { "reply": "Yes, custom cakes are eligible for refunds, … if you make it now." },
  "node_executions": [
    { "node_id": "approve", "node_type": "approval", "status": "completed",
      "output": { "decision": "approved", "approvalId": "apr_KJkOcEAZOXkkNmIj",
                  "resolvedBy": "user_7x9yZtYrtTbPXbx0", "editedArgs": null, "reason": null } },
    { "node_id": "send", "node_type": "tool", "status": "completed",
      "input": { "reply": "Yes, custom cakes are eligible for refunds, …" },
      "output": { "url": "https://httpbin.org/post", "json": { "reply": "Yes, custom cakes are eligible for refunds, …" } } }
  ],
  "usage": { "cost_usd": 0.00006205, "input_tokens": 275, "output_tokens": 107 }
}
```

(`node_executions` trimmed to the last two; the three agent steps come first.)

Done when the run went from `awaiting_input` to `succeeded` with
`required_action` cleared, the `approve` step records `"decision": "approved"`
and who decided, and `send` ran after it with the reviewed reply as input
(httpbin echoed it in `json`).

## Related skills

- `naturali-settle-an-approval` — list pending items, read the proposal, approve (edited) or reject.
- `naturali-orchestrate-several-agents` — the pipeline this step extends.
- `naturali-gate-a-tool-with-guardrails` — hold only the risky calls an agent makes, decided per call.
- `naturali-model-a-process-as-a-workflow` — work that waits on people between states, back and forth.
