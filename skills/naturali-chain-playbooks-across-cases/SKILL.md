---
name: naturali-chain-playbooks-across-cases
description: Chain naturali.ai playbooks so one case reads another through upstreams and upstream nodes, fill the chain once at its root, and refresh what a correction left stale. Use when asked to share one client's or property's data across many cases, bind a case to a parent case, propagate a correction downstream, delete a chain in order, or on PLAYBOOK_CASE_UPSTREAM_INVALID, UNKNOWN_UPSTREAM, UPSTREAM_CYCLE, PLAYBOOK_CASE_HAS_DEPENDENTS, PLAYBOOK_HAS_DEPENDENTS or PLAYBOOK_SELF_WRITE.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/chain-playbooks-across-cases
---

# Chain playbooks across cases

Outcome: a charge case reading a lease case reading a property case; the rent
is written once at the property, and a correction there reaches the charge
after one refresh per level.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- How nodes, cases, `missing` and revisioned writes work: `naturali-declare-a-playbook`.
- The template applied with `naturali-deploy-a-formation`.

Nothing here runs an agent, so it draws no tokens. Ids below are examples; use
the ones your own calls return.

## 1. Declare the chain

A definition names the playbooks it reads in `upstreams` (`{ name,
playbook_id }`). An `upstream` node (`upstream: { name, node_id }`, `inputs:
[]`, no executor) outputs that node of the bound case; later nodes read it with
an ordinary `{ node_id, field }` source. Add to `naturali.yaml`:

```yaml
resources:
  Property:
    type: playbook
    properties:
      name: property
      definition:
        nodes:
          - id: profile
            title: Property profile
            kind: collect
            final: true
            inputs:
              - { name: address, schema: { type: string, minLength: 1 }, required: true, source: manual, description: Street address }
              - { name: owner, schema: { type: string, minLength: 1 }, required: true, source: manual, description: Owner name }
              - { name: rent_base, schema: { type: number, minimum: 0 }, required: true, source: manual, description: Monthly base rent }
  Lease:
    type: playbook
    properties:
      name: lease
      definition:
        upstreams:
          - { name: property, playbook_id: { ref: Property } }
        nodes:
          - { id: prop, title: Property, kind: upstream, inputs: [], upstream: { name: property, node_id: profile } }
          - id: terms
            title: Lease terms
            kind: collect
            final: true
            inputs:
              - { name: rent_base, schema: { type: number }, required: true, source: { node_id: prop, field: output.rent_base } }
              - { name: tenant, schema: { type: string, minLength: 1 }, required: true, source: manual, description: Tenant name }
  Charge:
    type: playbook
    properties:
      name: charge
      definition:
        upstreams:
          - { name: lease, playbook_id: { ref: Lease } }
        nodes:
          - { id: ctr, title: Lease, kind: upstream, inputs: [], upstream: { name: lease, node_id: terms } }
          - id: charge
            title: Monthly charge
            kind: collect
            final: true
            inputs:
              - { name: rent_base, schema: { type: number }, required: true, source: { node_id: ctr, field: output.rent_base } }
              - { name: month, schema: { type: string, pattern: '^[0-9]{4}-[0-9]{2}$' }, required: true, source: manual, description: 'Billing month, YYYY-MM' }
outputs:
  property_id: { ref: Property }
  lease_id: { ref: Lease }
  charge_id: { ref: Charge }
```

Apply it with `naturali-deploy-a-formation`; export `PROPERTY`, `LEASE`,
`CHARGE` from `outputs`.

- The charge never names the property: it reaches it through the lease.
- An upstream naming no playbook of the project is `UNKNOWN_UPSTREAM`; one
  that reads the playbook back is `UPSTREAM_CYCLE` (both in `400
  PLAYBOOK_VALIDATION_FAILED` `error.meta.problems`, or from `POST
  …/playbooks/validate`).
- Without a formation: `POST …/playbooks` per playbook, root first, with the
  real `playbook_id` (CLI `naturali create-playbook`).

## 2. Open and bind the cases

Each case binds, in `upstreams`, a case for every name its playbook declares.
The binding is fixed for the life of the case; many cases may share one
upstream case (next month's charge binds the same lease).

CLI `naturali create-playbook-case --upstreams '{…}'` · SDK `naturali.playbooks.createPlaybookCase`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbooks/$PROPERTY/cases" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d '{ "subject": "Rua das Flores 12" }'
export PROPERTY_CASE=pbk_case_BVb3joB9UCqllk5z

curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbooks/$LEASE/cases" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d "{ \"subject\": \"Rua das Flores 12, lease\", \"upstreams\": { \"property\": \"$PROPERTY_CASE\" } }"
export LEASE_CASE=pbk_case_WqRJNUziy0pGJOrX

curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbooks/$CHARGE/cases" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d "{ \"subject\": \"Rua das Flores 12, 2026-11\", \"upstreams\": { \"lease\": \"$LEASE_CASE\" } }"
export CHARGE_CASE=pbk_case_QrSViwcagFtApQe5
```

```json
{ "id": "pbk_case_QrSViwcagFtApQe5", "upstreams": { "lease": "pbk_case_WqRJNUziy0pGJOrX" },
  "nodes": [
    { "id": "ctr", "state": "blocked", "blocked_by": ["terms"] },
    { "id": "charge", "state": "blocked", "blocked_by": ["ctr"] }
  ] }
```

A missing binding, one for an undeclared name, or one to a case of another
playbook or another `actor_id` is `400 PLAYBOOK_CASE_UPSTREAM_INVALID` and
creates nothing. Cases tied to an end user bind only that actor's cases.

## 3. Ask the end of the chain what is missing

`missing` follows the bindings: each entry carries the `case_id` to write it to.

CLI `naturali get-playbook-case-missing` · SDK `naturali.playbooks.getPlaybookCaseMissing`

```bash
curl -G "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CHARGE_CASE/missing" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -d node_id=charge
```

```json
{ "case_id": "pbk_case_QrSViwcagFtApQe5", "node_id": "charge",
  "waves": [[
    { "case_id": "pbk_case_BVb3joB9UCqllk5z", "node_id": "profile", "input": "rent_base", "description": "Monthly base rent", "required": true },
    { "case_id": "pbk_case_WqRJNUziy0pGJOrX", "node_id": "terms", "input": "tenant", "description": "Tenant name", "required": true },
    { "case_id": "pbk_case_QrSViwcagFtApQe5", "node_id": "charge", "input": "month", "description": "Billing month, YYYY-MM", "required": true }
  ]] }
```

(trimmed: `address` and `owner` are listed too.)

## 4. Fill the chain

Write each entry to the case it names (`naturali-declare-a-playbook` step 4),
`expected_revision: null`, `wait: true`: the property's three inputs, the
lease's `tenant`, the charge's `month`. Nothing is pulled by hand: once a bound
node is `done`, the `upstream` node reading it pulls it, through every level.
The charge ends `done` with `{ "rent_base": 2000, "month": "2026-11" }`, and
`missing` answers `waves: []`.

## 5. Correct the root, refresh each level

Write the new rent to the property case against the revision `rent_base` holds
(from the `inputs` of `GET …/playbook-cases/$PROPERTY_CASE`):

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$PROPERTY_CASE/inputs" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d '{ "inputs": [{ "node_id": "profile", "name": "rent_base", "value": 2500, "expected_revision": 3 }], "wait": true }'
```

Every node reading it, at any depth, is now `stale` and still holds 2000 —
readable, marked not current. An `upstream` node pulls again only when run, one
level at a time, root first:

CLI `naturali run-playbook-case-node` · SDK `naturali.playbooks.runPlaybookCaseNode`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$LEASE_CASE/nodes/prop/run" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d '{ "wait": true }'

curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/playbook-cases/$CHARGE_CASE/nodes/ctr/run" \
  -H "Authorization: Bearer $NATURALI_TOKEN" -H "Content-Type: application/json" \
  -d '{ "wait": true }'
```

```json
{ "node_id": "ctr", "status": "completed", "result": "current",
  "output": { "rent_base": 2500, "tenant": "Bruno Reis" }, "output_revision": 4 }
```

The node it names in the bound case must be `done`, else `409
PLAYBOOK_NODE_NOT_RUNNABLE`.

## 6. Tear down bottom-up

- Deleting a case another case is bound to is `409
  PLAYBOOK_CASE_HAS_DEPENDENTS`: delete the charge case, then the lease, then
  the property (CLI `naturali delete-playbook-case` · `DELETE
  …/playbook-cases/{case_id}`).
- A playbook with cases is `409 PLAYBOOK_HAS_CASES`; one another playbook
  declares as an upstream is `409 PLAYBOOK_HAS_DEPENDENTS`. With the cases gone,
  a formation teardown deletes them in reverse dependency order.
- A write by a node's own work (the version's author) to its case, or to a case
  reading it at any depth, is `403 PLAYBOOK_SELF_WRITE`: nodes feed their case
  through their output only.

Done when `GET …/playbook-cases/$CHARGE_CASE` shows `charge` `done` with the
rent last written at the property.

## Related skills

- `naturali-declare-a-playbook` — one playbook, its cases and revisioned writes.
- `naturali-fill-a-case-per-client` — let an agent fill a case in conversation.
- `naturali-attribute-spend-to-end-users` — actors, to tie a chain to one end user.
