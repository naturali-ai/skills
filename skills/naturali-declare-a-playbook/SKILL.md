---
name: naturali-declare-a-playbook
description: Declare a naturali.ai playbook (collect, execute, confirm nodes and their typed inputs) in naturali.yaml, open a case per subject, ask what it still misses, write inputs against their revision and run a node by hand. Use when asked to model a per-client or per-contract process as a playbook or case, or on PLAYBOOK_VALIDATION_FAILED, PLAYBOOK_EXECUTOR_FORBIDDEN, PLAYBOOK_INPUT_CONFLICT, PLAYBOOK_INPUT_INVALID, PLAYBOOK_NODE_NOT_RUNNABLE or PLAYBOOK_HAS_CASES.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/fill-a-case-per-client
---

# Declare a playbook

Outcome: a playbook whose cases are filled field by field, each write running
only the nodes it makes runnable or changes, its id exported as `PLAYBOOK` and
one case as `CASE`.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- For an `execute` node: the agent, tool, decider, workflow or orchestration it
  runs, in the same `naturali.yaml` (`Writer` below, from
  `naturali-create-an-agent`).
- The template applied with `naturali-deploy-a-formation`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the playbook

Add to `naturali.yaml`:

```yaml
resources:
  Onboarding:
    type: playbook
    properties:
      name: client-onboarding
      definition:
        nodes:
          - id: profile
            title: Client profile
            kind: collect
            inputs:
              - { name: company, schema: { type: string, minLength: 1 }, required: true,
                  source: manual, description: "The client's company name" }
              - { name: contact, schema: { type: string, minLength: 1 }, required: true,
                  source: manual, description: First name of the person we talk to }
          - id: welcome
            title: Welcome email
            kind: execute
            final: true
            executor: { type: agent, id: { ref: Writer } }
            inputs:
              - { name: company, schema: { type: string }, required: true,
                  source: { node_id: profile, field: output.company } }
              - { name: contact, schema: { type: string }, required: true,
                  source: { node_id: profile, field: output.contact } }
outputs:
  playbook_id: { ref: Onboarding }
```

Apply it with `naturali-deploy-a-formation`, then
`export PLAYBOOK=pbk_6z0YiJtaV2e8WT33` from `outputs.playbook_id`.

- `kind`: `collect` outputs its inputs; `execute` runs `executor` (`type`
  `agent`, `tool`, `decider`, `workflow` or `orchestration`; optional `input`,
  JSON Logic over the node's inputs; `operation_id` for an `mcp` tool);
  `confirm` waits for a person to approve its inputs; `upstream` reads another
  case (`naturali-chain-playbooks-across-cases`). `final: true` marks a goal.
- An input's `source` is `manual` (someone writes it; `description` is what
  gets asked) or `{ node_id, field: output.<key> }` — an edge. A node reads only
  what its sources name, so a write elsewhere never reruns it.
- Executors run as the credential that wrote the version, with its permissions
  as they stand at run time. One it may not start is `403
  PLAYBOOK_EXECUTOR_FORBIDDEN`; a trigger or OAuth token as author is `409
  PLAYBOOK_AUTHOR_UNAVAILABLE`.
- A bad graph (duplicate node or input, missing node or field, `execute` without
  executor, cycle, unknown executor) is `400 PLAYBOOK_VALIDATION_FAILED` with
  every problem in `error.meta.problems`. Check one without writing: CLI
  `naturali validate-playbook` · SDK `naturali.playbooks.validatePlaybook` ·
  `POST …/playbooks/validate` with `{ "definition": … }`.
- Only a change to `definition` archives a new `version`. Cases stay on theirs
  until upgraded (`POST …/playbook-cases/{case_id}/upgrade`).
- Without a formation (only when the user asks): `POST …/playbooks` with `name`
  and `definition` (CLI `naturali create-playbook` · SDK
  `naturali.playbooks.createPlaybook`).

## 2. Open a case

A case is one subject filled against one version. Cases are created by your
app, not the template.

CLI `naturali create-playbook-case` · SDK `naturali.playbooks.createPlaybookCase`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbooks/$PLAYBOOK/cases" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "subject": "Globex S.A." }'
```

```json
{
  "id": "pbk_case_omhpw1B6BKiVrPM9", "playbook_version": 1, "subject": "Globex S.A.",
  "revision": 0, "automation_status": "idle",
  "nodes": [
    { "id": "profile", "state": "blocked", "missing": ["company", "contact"], "blocked_by": [] },
    { "id": "welcome", "state": "blocked", "missing": [], "blocked_by": ["profile"] }
  ]
}
```

```bash
export CASE=pbk_case_omhpw1B6BKiVrPM9
```

- Optional `actor_id` ties the case to an end user (fixed at create); every
  single-case route then takes `actor_id` as a pin, and another actor's case is
  `404`. `GET …/playbook-cases?actor_id=…&subject=…` finds one.
- Node `state` is computed on read: `blocked`, `ready`, `running`, `waiting`,
  `done`, `stale`, `failed` or `rejected`.

## 3. Ask what is missing

Every input still to write before a goal, with the schema and description to
ask for it.

CLI `naturali get-playbook-case-missing` · SDK `naturali.playbooks.getPlaybookCaseMissing`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CASE/missing" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d node_id=welcome
```

```json
{
  "case_id": "pbk_case_omhpw1B6BKiVrPM9", "node_id": "welcome",
  "waves": [[
    { "node_id": "profile", "input": "company", "schema": { "type": "string", "minLength": 1 },
      "description": "The client's company name", "required": true },
    { "node_id": "profile", "input": "contact", "schema": { "type": "string", "minLength": 1 },
      "description": "First name of the person we talk to", "required": true }
  ]]
}
```

Inputs in one wave can be filled in any order; `waves: []` means nothing is left.

## 4. Write inputs

A batch, all or none. Each value names in `expected_revision` the revision of
the field it read: `null` for a field still unset. `wait: true` answers once
every node the write started has settled, with the case as it then stands.

CLI `naturali write-playbook-case-inputs` · SDK `naturali.playbooks.writePlaybookCaseInputs`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CASE/inputs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "inputs": [
    { "node_id": "profile", "name": "company", "value": "Globex S.A.", "expected_revision": null },
    { "node_id": "profile", "name": "contact", "value": "Marina", "expected_revision": null }
  ], "wait": true }'
```

```json
{
  "revision": 4, "automation_status": "idle",
  "nodes": [
    { "id": "profile", "state": "done", "output": { "value": { "company": "Globex S.A.", "contact": "Marina" }, "revision": 3 } },
    { "id": "welcome", "state": "done", "output": { "value": "Dear Marina, …", "revision": 4 } }
  ]
}
```

- Nobody ran `welcome`: completing `profile` made it runnable. A changed output
  reruns the nodes that read it, once each; an equal value writes no revision.
- To change a set field, read its revision from the `inputs` of `GET
  …/playbook-cases/$CASE` (CLI `naturali get-playbook-case`). A stale or `null`
  revision on a set field is `409 PLAYBOOK_INPUT_CONFLICT` (`error.meta.conflicts`)
  and nothing is written.
- An undeclared input, one that reads another node, or a value its schema
  refuses is `400 PLAYBOOK_INPUT_INVALID`.
- A `confirm` node is decided with `POST …/playbook-cases/$CASE/nodes/{node}/confirmation`
  (CLI `naturali confirm-playbook-case-node`), naming each input's revision the
  same way.

## 5. Run a node, read its history

Retry a `failed` node or recompute a `ready`, `stale` or `done` one:

CLI `naturali run-playbook-case-node` · SDK `naturali.playbooks.runPlaybookCaseNode`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CASE/nodes/welcome/run" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "wait": true }'
```

Any other state, or a required input unset, is `409 PLAYBOOK_NODE_NOT_RUNNABLE`;
a paused case `409 PLAYBOOK_CASE_PAUSED`.

Each run of a node, and each write, is recorded:

- `GET …/playbook-cases/$CASE/executions?node_id=welcome` (CLI `naturali
  list-playbook-case-executions`): `status`, `result` (`current` for the run
  behind the output), `run_id` (the generation), `input`, `output_revision`.
- `GET …/playbook-cases/$CASE/entries?node_id=profile` (CLI `naturali
  list-playbook-case-entries`): every value with its `revision`, who wrote it,
  and `on_behalf_of` when a `naturali` tool did.

## 6. Gates and teardown

- While the project owes for usage, creating a case, writing, running,
  confirming, exporting, resuming and upgrading answer `402
  insufficient_credit`; a Free account out of runs `403 plan_limit_reached`
  (`resource: "runs"`). Reads and `POST …/playbook-cases/$CASE/pause` always
  work.
- A playbook with cases is not deleted (`409 PLAYBOOK_HAS_CASES`), by a
  formation teardown either. Delete its cases first: CLI `naturali
  delete-playbook-case` · `DELETE …/playbook-cases/{case_id}`.

Done when `GET …/playbook-cases/$CASE` shows every final node `done` and
`missing` for each goal answers `waves: []`.

## Related skills

- `naturali-fill-a-case-per-client` — let an agent fill each client's case in conversation.
- `naturali-chain-playbooks-across-cases` — a case that reads another case.
- `naturali-create-an-agent` — the agent an `execute` node runs.
- `naturali-model-a-process-as-a-workflow` — a task held in one state at a time instead.
