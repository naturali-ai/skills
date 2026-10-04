---
name: naturali-model-a-process-as-a-workflow
description: Declare a review process as a naturali.ai workflow, with the agent that drafts, in a formation template and deploy it; the agent drafts on entering a state, a person sends the draft back with feedback or approves it, and the task history records every move including the backward one. Use when asked to create a naturali workflow or state machine, open a task, add a human review state, fire a task transition, send work back for revision, approve and close a task, or read a task's history or audit trail.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/model-a-process-as-a-workflow
---

# Model a process as a workflow

Outcome: a customer-reply process modelled as a workflow, deployed from a
formation — an agent drafts, a person reviews, sends the draft back with
feedback and approves the redraft — proven by a task whose history records
every move, the backward one included.

An orchestration runs forward to an end on its own; a workflow holds work in
named states that people and agents move it between, back as well as forward.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key.
- `PROJECT` and `PROVIDER` — a project and a working AI provider, as in
  `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- Every entry into a state that dispatches an agent is one generation: this
  counts as two runs. A move into such a state is refused while the project
  owes for usage already served.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Create the writer agent

Declare the agent and the workflow in one template, `customer-reply.yaml`; the
provider comes in as a parameter. The file starts:

```yaml
parameters:
  ProviderId:
    type: string
resources:
  Writer:
    type: agent
    properties:
      name: reply-writer
      ai_provider_id:
        param: ProviderId
      instructions: You draft short replies to customer requests for a small online store. Write two or three sentences, friendly and specific. If reviewer feedback is given, follow it. Reply with only the draft.
```

- Only when the user asks for direct calls: `POST …/agents` with the same
  properties as the body (CLI `naturali create-agent` · SDK
  `naturali.agents.createAgent`).

## 2. Declare the workflow

- `draft` is `initial`; its `on_enter` dispatches the writer (`agent_id` is a
  `ref` to the agent above) with an `input_mapping` (JSON Logic) built from the
  request and the feedback or `none`. `on_complete` fires `submit` when the
  draft completes.
- `review` is a `human` state: it dispatches nothing and waits for a person.
- `sent` is `terminal`: reaching it closes the task.
- `revise` goes from `review` back to `draft`.
- `on_failure: submit` sends a failed draft to `review` too, so a person always
  sees the task rather than finding it stuck.

The file continues:

```yaml
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
              agent_id: { ref: Writer }
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
  workflow_id:
    ref: Process
```

Validate (creates nothing), then deploy:

CLI `naturali validate-formation` · SDK `naturali.formations.validateFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/validate" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t customer-reply.yaml '{template: $t}')"
```

```json
{ "valid": true, "errors": [], "warnings": [] }
```

CLI `naturali create-formation` · SDK `naturali.formations.createFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t customer-reply.yaml --arg p "$PROVIDER" \
        '{name: "customer-reply", template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "workflow_id": "wfl_UN6kjkWLS93DdpB7" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- The workflow starts at `version` 1. To change the process later, edit
  `customer-reply.yaml`, `POST …/formations/plan` with `formation_id` (CLI
  `naturali plan-formation` · SDK `naturali.formations.planFormation`), then
  `PUT …/formations/{formation_id}` (CLI `naturali update-formation` · SDK
  `naturali.formations.updateFormation`).
- Only when the user asks for direct calls: `POST …/workflows` with `name`,
  `states`, `transitions` (CLI `naturali create-workflow` · SDK
  `naturali.workflows.createWorkflow`).

```bash
export FORMATION=form_EPis15Nfukary167
export WORKFLOW=wfl_UN6kjkWLS93DdpB7
```

## 3. Open a task

The task starts in `draft`, so creating it dispatches the writer at once.
`payload` is yours.

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
  "last_result": null }
```

- A task is not a template resource type: opening, editing and moving it stay
  direct calls.
- `workflow_version` is pinned: editing the workflow later leaves this task on
  the version it started on.

```bash
export TASK=task_AAek4fmGzU5FiPJm
```

## 4. Read the draft

When the writer finishes, `on_complete` fires `submit` and the task moves to
`review` on its own. Read until `state` is `review`; the draft is in
`last_result.content`.

CLI `naturali get-task` · SDK `naturali.tasks.getTask`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "state": "review", "status": "open",
  "last_result": { "content": "It looks like your order 1042 is running a bit late today. … I expect it with you by end of day. …", "finishReason": "stop" },
  "automation_chain_depth": 1 }
```

The draft promises a delivery time nobody checked.

## 5. Leave feedback

`PATCH` edits the payload, never the state. A payload patch merges, so the
request stays and `feedback` is added — the field the `input_mapping` reads.

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

## 6. Send it back

Move a task by firing a transition by name; the workflow decides whether the
move is legal. `revise` returns it to `draft`, which dispatches the writer
again with the feedback.

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

Read the task again as in step 4; back in `review`, the new draft follows the
feedback:

```json
{ "state": "review", "last_result": { "content": "We’ve opened a trace with the carrier to locate your order. We will send you an email with further updates within 24 hours." } }
```

## 7. Approve it

CLI `naturali transition-task` · SDK `naturali.tasks.transitionTask`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK/transitions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "transition": "approve" }'
```

```json
{ "state": "sent", "status": "closed" }
```

- A closed task moves no further: another transition answers
  `409 TASK_TRANSITION_CONFLICT`.

## 8. Read the history

Every move, oldest first, append-only.

CLI `naturali get-task-history` · SDK `naturali.tasks.getTaskHistory`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/tasks/$TASK/history" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
[
  { "from_state": null, "to_state": "draft", "transition": null, "principal_kind": "api_key" },
  { "from_state": "draft", "to_state": "review", "transition": "submit", "principal_kind": "automation", "generation_id": "gen_vkrMX0GBQEP4pRJ5" },
  { "from_state": "review", "to_state": "draft", "transition": "revise", "principal_kind": "api_key", "note": "No delivery promises" },
  { "from_state": "draft", "to_state": "review", "transition": "submit", "principal_kind": "automation", "generation_id": "gen_OEvJjZQ1pyoEQgD0" },
  { "from_state": "review", "to_state": "sent", "transition": "approve", "principal_kind": "api_key" }
]
```

Done when the history shows each `submit` by `automation` naming the
generation that drafted, every move you made as `api_key` (your key's id in
`principal_id`), and the `revise` from `review` back to `draft` in the record.

## Related skills

- `naturali-orchestrate-several-agents` — `on_enter` can dispatch a whole orchestration instead of one agent.
- `naturali-pause-a-run-for-a-human-decision` — park work for a person's approval inside a run.
- `naturali-deploy-a-system-from-a-template` — formations in depth: plan, update, teardown.
