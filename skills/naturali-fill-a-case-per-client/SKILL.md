---
name: naturali-fill-a-case-per-client
description: Give a naturali.ai agent a naturali tool confined to one playbook case, so it fills each client's case in conversation, asks only for what is missing, and a correction reruns only the steps that read it. Use when asked to have an agent collect onboarding or intake data, chat a client through a case, pin a tool to a case_id or actor_id, attribute an agent's writes, or on MISSING_TOOL_CONTEXT_KEY or 409 PLAYBOOK_INPUT_CONFLICT from an agent's write.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/fill-a-case-per-client
---

# Fill a case per client

Outcome: one playbook case per client, filled by an agent in that client's
session; a correction made in conversation rewrites the goal that reads it and
leaves the others untouched.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Provider` in `naturali.yaml`, from `naturali-enable-naturali-models` or
  `naturali-bring-your-own-model-key`.
- The playbook and one client's case, from `naturali-declare-a-playbook`
  (`PLAYBOOK`, `CASE`). The example below extends its `client-onboarding`:
  `profile` (company, contact) feeds the `welcome` email written by `Writer`;
  add a `plan` collect node (`seats`: integer, minimum 1; `tier`: enum
  `starter`/`growth`) and a final `order` collect node reading
  `profile.output.company`, `plan.output.seats` and `plan.output.tier`.
- Every turn and tool call is a run, billed as in `naturali-run-a-generation`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the case tool and the agent

A `naturali` tool runs this API's operations as the agent's tools. Pinning
`case_id` to `{{context:case_id}}` confines it to the case each session
carries: the model never sees or overrides it. List only actions that take a
case — one without `case_id` (`list-playbook-cases`) would reach every case.

Add to `naturali.yaml`:

```yaml
resources:
  ThisCase:
    type: tool
    properties:
      name: this-case
      type: naturali
      actions: [get-playbook-case, get-playbook-case-missing, write-playbook-case-inputs]
      preset_parameters:
        case_id: '{{context:case_id}}'
  Assistant:
    type: agent
    properties:
      name: onboarding-assistant
      ai_provider_id: { ref: Provider }
      model: claude-haiku-4.5     # calls tools reliably; on your own key pick one of its models that does
      tool_bindings:
        - tool_id: { ref: ThisCase }
      instructions: >-
        You onboard a new business client in chat, through tools that work on this
        client's onboarding case. Every turn: 1) call get-playbook-case-missing with
        node_id order; 2) record every listed input the client's messages already
        answer with one write-playbook-case-inputs call, wait true; expected_revision
        is null for a field still unset, and for a field already set it is the
        revision get-playbook-case shows on that input; 3) reply. Never invent a value
        and never ask for one the client already gave. The client only sees your last
        message: say what you recorded and ask, in one short message, for what is
        still missing, using each input's description.
outputs:
  assistant_id: { ref: Assistant }
```

Apply it with `naturali-deploy-a-formation`; `export ASSISTANT=…` from
`outputs.assistant_id`.

- `actions` are the operations' MCP names; anything else is `400 bad_request`.
  A preset naming `project_id` is `400`. Bind the tool by `tool_id`, never
  inline.
- `wait: true` on the write lets the agent see in the same turn what it started.
- Add `confirm-playbook-case-node` to `actions` to let the agent record a
  client's sign-off on a `confirm` node.
- An agent serving many people through a channel: pin `actor_id:
  '{{context:actor_id}}'` instead and add `list-playbook-cases` and
  `create-playbook-case`; a session turn carries its actor, and the agent finds
  the client's case by `subject` or creates it.
- Each call is checked against the generation's caller and the agent's
  `policy_ids`; outside them it is refused and the tool reports the error.

## 2. Open the client's session

Your app opens one session per client, carrying the case in `tool_context`
(write-only: no read returns it).

CLI `naturali create-session` · SDK `naturali.sessions.createSession`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"agent_id\": \"$ASSISTANT\", \"tool_context\": { \"case_id\": \"$CASE\" } }"
```

```json
{ "id": "sess_2vRXuNgmfS3CT0e7", "agent_id": "agent_DVPP84Fee7Y3CMtX",
  "conversation_id": "conv_SjgixjyBpyYLXk8x", "status": "open", "auto_generate": false }
```

```bash
export SESSION=sess_2vRXuNgmfS3CT0e7
```

A turn without `case_id` in its context fails the tool call with
`MISSING_TOOL_CONTEXT_KEY` instead of reaching another case. A channel's
sessions carry no case, so with a `case_id` preset your app relays the client's
messages into this session.

## 3. Converse

Add the client's message, then generate the reply.

CLI `naturali add-session-message`, `naturali generate-session-response` · SDK `naturali.sessions.addSessionMessage`, `naturali.sessions.generateSessionResponse`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Hi, Marina here. We want the growth plan for 12 people." }'

curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/sessions/$SESSION/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "status": "completed",
  "content": "Perfect! I've recorded your growth plan for 12 people. …",
  "generation_id": "gen_2seG3c8JSLrsyFdy" }
```

The agent read what was missing and wrote `seats` and `tier`: `plan` and
`order` are `done`. A correction ("Sorry, make it 15 seats.") is the same two
calls; the agent writes `seats` against the revision it read.

- A write of a set field with `expected_revision: null` is `409
  PLAYBOOK_INPUT_CONFLICT` and writes nothing — the agent's instructions must
  name the revision `get-playbook-case` shows. The same rule stops a person and
  the agent overwriting each other.
- Session errors (`409`, `410`, `429`, `402`) are in `naturali-converse-in-a-session`.

## 4. Prove only the order moved

CLI `naturali list-playbook-case-executions` · SDK `naturali.playbooks.listPlaybookCaseExecutions`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CASE/executions" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d node_id=welcome
```

```json
{ "data": [{ "id": "pbk_exe_vQj57ixVSf4xZbcj", "node_id": "welcome", "status": "completed",
    "result": "current", "run_id": "gen_V6BE4tOf15XExjEe", "output_revision": 4 }],
  "next_cursor": null }
```

One draft: `GET …/playbook-cases/$CASE` shows `order` at 15 seats and `welcome`
still at its first revision. Correcting `contact` instead would make `welcome`
`stale` and redraft it.

Who wrote what: `GET …/playbook-cases/$CASE/entries?node_id=plan` (CLI
`naturali list-playbook-case-entries`) shows the correction with
`on_behalf_of` naming `tool_id`, `agent_id`, `session_id`, `generation_id` and
`actor_id`; entries written directly carry `on_behalf_of: null`.

Done when the case's final nodes are `done` from the conversation alone and the
executions list shows one run per goal input actually changed.

## Related skills

- `naturali-declare-a-playbook` — nodes, cases, revisions, running a node.
- `naturali-chain-playbooks-across-cases` — one client's data read by many cases.
- `naturali-converse-in-a-session` — sessions, turns and their errors.
- `naturali-attribute-spend-to-end-users` — actors, for the `actor_id` pin.
- `naturali-limit-what-an-agent-may-do` — narrow the agent with `policy_ids`.
