---
name: naturali-invite-a-colleague
description: Give a teammate access to a naturali.ai project by email — even someone with no naturali account — with the member or admin role, watch their status go from pending to active on first sign-in, then change their role or remove them. Use when asked to invite, add or share a naturali project with a colleague, list project members, promote someone to admin, remove a member, or understand why a member shows as pending.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/invite-a-colleague
---

# Invite a colleague

Outcome: a second person with access to one of your projects, added by email
address with the role you chose — watched going from `pending` to `active` the
first time they sign in. Members are free and unlimited on every plan.

## Before you start

- `NATURALI_TOKEN` — an account-wide credential: a session JWT, or a `nat_sk_…`
  key *not* scoped to one project. A project-scoped key gets `403
  access_denied` in step 2. `NATURALI_API=https://api.naturali.ai/v1` for the
  curl calls.
- `PROJECT` — a project you are the `owner` or an `admin` of, e.g. from
  `naturali-first-agent-generation`.
- A colleague's email address; it needs no naturali account. Use one you
  control to follow step 3 yourself.
- No formation here: membership is not a declarable resource, so every step
  is a direct call.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. See who is in the project

CLI `naturali list-project-members` · SDK `naturali.projects.listProjectMembers`

```bash
curl "$NATURALI_API/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [{ "email": "you@acme.com", "status": "active", "role": "owner", "invited_by_user_id": null }] }
```

## 2. Add your colleague

`member` reads and writes everything in the project (agents, project keys,
channels). `admin` also decides who else is here and how the project is
configured. Neither can delete the project.

CLI `naturali add-project-member` · SDK `naturali.projects.addProjectMember`

```bash
curl -X POST "$NATURALI_API/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@acme.com","role":"member"}'
```

```json
{ "id": "pmem_3ZjkQ2mN8pRtYv7X", "email": "ana@acme.com", "status": "pending",
  "role": "member", "invited_by_user_id": "user_V1StGXR8Z5jdHi6B" }
```

```bash
export MEMBER=pmem_3ZjkQ2mN8pRtYv7X
```

- `pending` = she has never signed in; an existing account reads `active` with
  access at once. Either way the membership is recorded now and she is emailed.
- An `admin` cannot grant `admin` to anybody else.
- The address is the credential: a typo grants access to whoever holds that
  address. Check for `pending` rows and remove a wrong one (step 4).

## 3. Watch them arrive

Nothing to accept: Ana signs in with an emailed code, which proves the address
is hers. Then read the list again as yourself:

CLI `naturali list-project-members` · SDK `naturali.projects.listProjectMembers`

```bash
curl "$NATURALI_API/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "data": [
    { "email": "you@acme.com", "status": "active", "role": "owner" },
    { "email": "ana@acme.com", "status": "active", "role": "member" }
] }
```

`status` is derived from whether the account has ever signed in.

## 4. Change their role, or let them go

Only the project `owner` may promote to `admin`.

CLI `naturali update-project-member` · SDK `naturali.projects.updateProjectMember`

```bash
curl -X PATCH "$NATURALI_API/projects/$PROJECT/members/$MEMBER" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'
```

```json
{ "id": "pmem_3ZjkQ2mN8pRtYv7X", "email": "ana@acme.com", "status": "active", "role": "admin" }
```

Removing answers `204`:

CLI `naturali remove-project-member` · SDK `naturali.projects.removeProjectMember`

```bash
curl -X DELETE "$NATURALI_API/projects/$PROJECT/members/$MEMBER" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- An `admin` may remove a `member` but not another `admin`; anyone may remove
  themselves. No call here touches the `owner`'s row.

Done when the list shows your colleague with the chosen `role` and
`status: "active"` after their first sign-in.

## Related skills

- `naturali-first-agent-generation` — build the project and agent your colleague will work on.
- `naturali-pause-a-run-for-a-human-decision` — with someone else in the project, the human in the loop can be a different person.
