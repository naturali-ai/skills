---
name: naturali-model-a-process-as-a-workflow
description: Model a naturali.ai review process as a workflow - an agent drafts on entering a state, a person sends the draft back with feedback or approves it - by declaring the workflow in the formation template, opening a task, firing transitions and reading the task's append-only history. Use when asked to build a naturali workflow or state machine, add a human review state, have an agent work on entering a state with on_enter, open or move a task, send work back for revision, approve and close a task, edit a task's payload, read who moved a task and why, or debug 409 TASK_TRANSITION_CONFLICT.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/model-a-process-as-a-workflow
---

# Model a process as a workflow

Outcome: a `customer-reply` workflow in which an agent drafts and a person
reviews, sends the draft back with feedback and approves the redraft, proven by
a task whose history records every move, the backward one included.

An orchestration runs forward to an end on its own; a workflow holds a piece of
work in named states that people and agents move it between, back as well as
forward, for as long as the work lives.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Provider` in `naturali.yaml`, deployed as `$FORMATION` with
  `naturali-deploy-a-formation`.
- Every entry into a state that dispatches an agent is one generation: this
  process counts as two runs against the plan and draws managed tokens on the
  balance. A move into such a state is refused (`402 insufficient_credit`)
  while the project owes for usage already served.

Ids below are examples; use the ones your own calls return.

## 1. Declare the writer agent and the workflow

The writer reads one message holding the customer's request and any reviewer
feedback (agent mechanics in `naturali-create-an-agent`). The workflow:

- `draft` is `initial`. Its `on_enter` dispatches the writer; `input_mapping`
  builds the agent's `prompt` from the task with JSON Logic — the request, and
  the feedback or `none`. When the draft completes, `on_complete` fires
  `submit`.
- `on_failure: submit` sends a failed draft to `review` too, so a person always
  sees the task instead of finding it stuck.
- `review` is `kind: human`: it dispatches nothing and waits for a person.
- `sent` is `terminal`: reaching it closes the task.
- `revise` goes from `review` back to `draft` — the move a one-way graph cannot
  make.

Add to `naturali.yaml`:

```yaml
resources:
  ReplyWriter:
    type: agent
    properties:
      name: reply-writer
      ai_provider_id: { ref: Provider }
      instructions: You draft short replies to customer requests for a small online store. Write two or three sentences, friendly and specific. If reviewer feedback is given, follow it. Reply with only the draft.
  Process:
    type: workflow
    properties:
      name: customer-reply
      states:
        - name: draft
          initial: true
          on_enter:
            dispatch:
              kind: agent
              agent_id: { ref: ReplyWriter }
              input_mapping:
                prompt:
                  cat:
                    - "Customer request: "
                    - { var: task.payload.request }
                    - "\nReviewer feedback: "
                    - { var: [task.payload.feedback, none] }
            on_complete: [{ when: true, transition: submit }]
            on_failure: submit
        - { name: review, kind: human }
        - { name: sent, terminal: true }
      transitions:
        - { name: submit, from: [draft], to: review }
        - { name: revise, from: [review], to: draft }
        - { name: approve, from: [review], to: sent }
outputs:
  workflow_id: { ref: Process }
```

Apply it with `naturali-deploy-a-formation`; the plan reports `create` for
`ReplyWriter` and `Process`. The workflow starts at `version` 1.

```bash
export WORKFLOW=wfl_UN6kjkWLS93DdpB7
```

- Without a formation (only when the user asks): `POST …/workflows` with
  `name`, `states`, `transitions`, the agent's real id in `agent_id` (CLI
  `naturali create-workflow` · SDK `naturali.workflows.createWorkflow`).
- A task is not a template resource: opening, editing and moving one are
  direct calls.

## 2. Open a task

A task is one customer request moving through the workflow. Its `payload` is
yours — here the request the writer reads. It starts in `draft`, so creating it
dispatches the writer at once.

CLI `naturali create-task` · SDK `naturali.tasks.createTask`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/tasks" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"workflow_id\": \"$WORKFLOW\",
    \"title\": \"Order 1042: late delivery\",
    \"payload\": { \"request\": \"My order 1042 was due on Monday and still has not arrived. Where is it?\" }
  }"
```

```json
{ "id": "task_AAek4fmGzU5FiPJm", "workflow_version": 1, "state": "draft", "status": "open",
  "last_result": null, "automation_chain_depth": 0, "pending_transition": null }
```

```bash
export TASK=task_AAek4fmGzU5FiPJm
```

- `workflow_version` is pinned: editing the workflow later leaves this task on
  the machine it started on.

## 3. Read the draft

When the writer finishes, `on_complete` fires `submit` and the task moves to
`review` on its own (about a second here). Read until `state` is `review`; the
draft is in `last_result.content`.

CLI `naturali get-task` · SDK `naturali.tasks.getTask`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "state": "review", "status": "open",
  "last_result": { "content": "It looks like your order 1042 is running a bit late today. … so I expect it with you by end of day. …", "finishReason": "stop" },
  "automation_status": null, "automation_chain_depth": 1 }
```

The draft promises a delivery time nobody checked.

## 4. Leave feedback

`PATCH` edits the payload, never the state. A payload patch is shallow-merged,
so `request` stays and `feedback` — the field the writer's `input_mapping`
reads — is added. The merged payload must still satisfy any `payload_schema`.

CLI `naturali update-task` · SDK `naturali.tasks.updateTask`

```bash
curl -X PATCH "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "payload": { "feedback": "Do not promise a delivery time. Say we opened a trace with the carrier and will email an update within 24 hours." } }'
```

```json
{ "state": "review", "payload": { "request": "My order 1042 was due on Monday …", "feedback": "Do not promise a delivery time. …" } }
```

## 5. Send it back

Move a task by firing a transition by name; the workflow decides whether the
move is legal. `revise` takes it from `review` back to `draft`, which
dispatches the writer again, this time with the feedback.

CLI `naturali transition-task` · SDK `naturali.tasks.transitionTask`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK/transitions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "transition": "revise", "note": "No delivery promises" }'
```

```json
{ "state": "draft", "status": "open", "automation_chain_depth": 0 }
```

Read the task as in step 3; once back in `review`, the new draft follows the
feedback:

```json
{ "state": "review", "last_result": { "content": "We’ve opened a trace with the carrier to locate your order. We will send you an email with further updates within 24 hours." } }
```

## 6. Approve it

Same call with `{ "transition": "approve" }`; `sent` is terminal, so the task
closes:

```json
{ "state": "sent", "status": "closed" }
```

- A closed task moves no further: any transition now answers
  `409 TASK_TRANSITION_CONFLICT`.

## 7. Read the history

Every move, oldest first, with who made it and what caused it. Append-only.

CLI `naturali get-task-history` · SDK `naturali.tasks.getTaskHistory`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK/history" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
[
  { "from_state": null, "to_state": "draft", "transition": null, "principal_kind": "api_key", "generation_id": null },
  { "from_state": "draft", "to_state": "review", "transition": "submit", "principal_kind": "automation", "generation_id": "gen_vkrMX0GBQEP4pRJ5" },
  { "from_state": "review", "to_state": "draft", "transition": "revise", "principal_kind": "api_key", "note": "No delivery promises" },
  { "from_state": "draft", "to_state": "review", "transition": "submit", "principal_kind": "automation", "generation_id": "gen_OEvJjZQ1pyoEQgD0" },
  { "from_state": "review", "to_state": "sent", "transition": "approve", "principal_kind": "api_key" }
]
```

Done when each `submit` is by `automation` and names the generation that
drafted, every move you made is `api_key` (your key's id in `principal_id`),
and the `revise` from `review` back to `draft` sits in the record beside the
others.

- A transition's `guard` (JSON Logic) refuses the move unless the task passes
  it, and `requires_approval: true` parks the move for a person.
- `on_enter` can dispatch a `tool` or an `orchestration` instead of an agent.
- Pausing a task (`POST …/tasks/{task_id}/pause`, CLI `naturali pause-task` ·
  SDK `naturali.tasks.pauseTask`) keeps its place and dispatches nothing until
  resumed.

## Related skills

- `naturali-orchestrate-several-agents` — a pipeline a state's `on_enter` can dispatch.
- `naturali-settle-an-approval` — settle a move gated by `requires_approval`.
- `naturali-read-a-run` — the generation named in a history entry.
- `naturali-pause-a-run-for-a-human-decision` — a one-off approval inside a run instead of a long-lived process.
