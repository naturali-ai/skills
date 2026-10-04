---
name: naturali-settle-an-approval
description: Approve, edit or reject a held naturali.ai action from the approvals queue, and find what ran next. Use when asked to approve, reject, sign off, review or edit a pending approval, clear the approvals queue, find why a run is awaiting_input or a tool result says pending_approval, or when approve answers 409 because the item expired or was already settled.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/gate-a-tool-with-guardrails
---

# Settle an approval

Outcome: a held action decided on the record — executed with the frozen (or
edited) arguments, or refused with a reason — and the work that resumed from
it found.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- A pending approval: from a guardrail-held tool call
  (`naturali-gate-a-tool-with-guardrails`, which exports `GENERATION`) or an
  orchestration approval step (`naturali-pause-a-run-for-a-human-decision`,
  which exports `RUN`).
- Listing approvals needs the **Pro** plan or above (the project owner's).
  Reading, approving and rejecting an existing item answer on every plan;
  without the list, its id is in the activity feed (`kind=approval_created`,
  in `ref_id`).

Ids below are examples; use the ones your own calls return.

## 1. Find the pending item

CLI `naturali list-approvals` · SDK `naturali.approvals.listApprovals`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/approvals?status=pending" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    {
      "id": "apr_diGdFF6EmxwsBlJ8",
      "origin": "tool_call",
      "status": "pending",
      "proposed_action": { "tool_id": "tool_NzCBgtWBAG7QkiaJ", "action": "issue-refund",
                           "arguments": { "amount": 400, "order_id": "1002" } },
      "generation_id": "gen_TBcvldVPdTcjWclu",
      "expires_at": "2026-10-04T01:34:56.916Z"
    }
  ],
  "total": 1
}
```

```bash
export APPROVAL=apr_diGdFF6EmxwsBlJ8
```

- Filters: `status` (`pending`, `approved`, `rejected`, `expired`), `origin`
  (`tool_call`, `node`, `task_transition`), `expires_before`, `limit`,
  `offset`.
- A paused orchestration run names its item directly in
  `required_action.approval_id`.

## 2. Read the proposal

CLI `naturali get-approval` · SDK `naturali.approvals.getApproval`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "apr_diGdFF6EmxwsBlJ8",
  "origin": "tool_call",
  "status": "pending",
  "proposed_action": { "tool_id": "tool_NzCBgtWBAG7QkiaJ", "action": "issue-refund",
                       "arguments": { "amount": 400, "order_id": "1002" } },
  "reasoning": "Customer requested refund for order 1002, amount $400.00",
  "predicted_impact": "Full refund of $400.00 will be credited back to the customer's payment method.",
  "generation_id": "gen_TBcvldVPdTcjWclu",
  "agent_id": "agent_8xS50HUYsaFDGH11",
  "policy_version": "guard_WwusNpQOzrgblxuA@1",
  "expires_at": "2026-10-04T01:34:56.916Z",
  "resolved_by": null
}
```

- `proposed_action.arguments` are frozen: approving executes exactly these,
  never a value the model writes later.
- `reasoning`, `evidence` and `predicted_impact` are what to decide on.
- `origin` says which correlation fields are set: `tool_call` →
  `generation_id`, `session_id`, `agent_id`; `node` →
  `orchestration_run_id`, `node_id`; `task_transition` → `task_id`,
  `task_transition` and no `proposed_action`.
- `policy_version` names the guardrail version that held the call.

## 3. Approve — or reject

CLI `naturali approve-approval` · SDK `naturali.approvals.approveApproval`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL/approve" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{ "id": "apr_diGdFF6EmxwsBlJ8", "status": "approved",
  "resolved_by": "user_7x9yZtYrtTbPXbx0", "edited_arguments": null }
```

- Approving runs the tool with the frozen arguments; the guardrail is not
  asked again.
- Edit, then approve: send `{ "arguments": { "order_id": "1002", "amount": 250 } }`.
  The original stays on the item and the replacement is recorded in
  `edited_arguments`. Arguments that fail the tool's `parameters` schema
  answer `400`; editing composes a new call, so it also needs permission to
  call the tool (`403` otherwise).
- `tool_context` (string map) on the approve call is forwarded as context
  headers on the approved action and the continuation's tool calls; it is
  never stored on the item.
- `expires_at` is re-checked at decision time: an expired or already settled
  item answers `409`, never a late success.

To refuse, a `reason` is required (`400` without one); nothing runs.

CLI `naturali reject-approval` · SDK `naturali.approvals.rejectApproval`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/approvals/$APPROVAL/reject" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Refunds over 200 go through finance." }'
```

## 4. Find what ran next

A `tool_call` item: deciding starts a continuation generation that tells the
agent the outcome, linked to the generation that proposed the call.

CLI `naturali list-generations` · SDK `naturali.generations.listGenerations`

```bash
curl -sS \
  "https://api.naturali.ai/v1/projects/$PROJECT/generations?initiator_generation_id=$GENERATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [{ "id": "gen_5EHZBqKyhI6h6O23", "initiator_generation_id": "gen_TBcvldVPdTcjWclu",
             "status": "completed", "stop_reason": "stop" }], "total": 1 }
```

- Its transcript (`naturali-read-a-run`) opens with "Approval
  apr_diGdFF6EmxwsBlJ8 … was approved. The action has been executed.
  Result: …" and ends with the agent's reply. After a rejection it tells the
  agent why.
- A `node` item: the run leaves `awaiting_input` and follows the edge whose
  `condition` matches (`approved`, `rejected`, `expired`); read it back with
  `naturali-pause-a-run-for-a-human-decision`. On a rejection with no
  `rejected` edge the run ends `succeeded`, the tool step `skipped`, and the
  approval step's output carries `"decision": "rejected"` and the reason.
- An item nobody settles expires and can never be approved. The agent's
  `on_approval_expiry` decides what follows: `terminate` (default) ends the
  chain, recorded as an `approval_expired` exception; `react` starts a
  continuation telling the agent.
- `GET …/approvals/recurrences?min_count=3` (CLI
  `naturali list-approval-recurrences`, Pro) groups proposals you keep
  deciding, with the reasons given — a candidate for a guardrail rule.

Done when the item is `approved` or `rejected` with `resolved_by` set, and the
continuation (or the resumed run) has completed.

## Related skills

- `naturali-gate-a-tool-with-guardrails` — decide per call which tool calls need a person.
- `naturali-pause-a-run-for-a-human-decision` — an approval step that holds every orchestration run.
- `naturali-read-a-run` — the continuation's transcript and the chain it belongs to.
