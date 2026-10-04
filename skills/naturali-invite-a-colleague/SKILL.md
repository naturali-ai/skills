---
name: naturali-invite-a-colleague
description: Give a teammate access to a naturali.ai project by email address - even someone with no naturali account - as member or admin, see them go from pending to active on their first sign-in, then change their role or remove them. Use when asked to invite, add or share a project with a colleague, list project members, promote someone to admin, remove a member or leave a project, explain why a member shows as pending, or fix a 403 access_denied when adding a member with a project-scoped key or a 409 for an address already in the project.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/invite-a-colleague
---

# Invite a colleague

Outcome: a second person with access to your project, added by email with the
role you chose, `active` from their first sign-in. Members are free and
unlimited on every plan (naturali is priced on runs, not seats); the project's
billing owner pays for what they run.

## Before you start

- `NATURALI_TOKEN` — an **account-wide** credential: a session JWT, or a
  `nat_sk_…` key *not* scoped to one project. A project-scoped key is refused
  `403 access_denied` on adding: the membership would outlive the key's own
  revocation.
- `PROJECT` — a project you are `owner` or `admin` of, from
  `naturali-create-a-project` or any you have.
- The colleague's email address; it needs no naturali account. Use one you
  control to watch step 3 yourself.
- Membership is not a formation resource: every step is a direct call.

Ids below are examples; use the ones your own calls return.

## 1. See who is in the project

Readable by every member, whatever their role.

CLI `naturali list-project-members` · SDK `naturali.projects.listProjectMembers`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "pmem_V1StGXR8Z5jdHi6B", "email": "you@acme.com", "status": "active",
      "role": "owner", "invited_by_user_id": null }
  ]
}
```

- A new project has one row: you, `owner`. `invited_by_user_id` is `null` on
  the founding owner, added by creating the project.

## 2. Add your colleague

`member` reads and writes everything in the project — agents, project keys,
channels. `admin` also decides who else is here and how the project is
configured. Neither can delete the project; that stays with the `owner`.

CLI `naturali add-project-member` · SDK `naturali.projects.addProjectMember`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "ana@acme.com", "role": "member" }'
```

```json
{
  "id": "pmem_3ZjkQ2mN8pRtYv7X",
  "project_id": "proj_V1StGXR8Z5jdHi6B",
  "email": "ana@acme.com",
  "status": "pending",
  "role": "member",
  "invited_by_user_id": "user_V1StGXR8Z5jdHi6B"
}
```

```bash
export MEMBER=pmem_3ZjkQ2mN8pRtYv7X
```

- `pending` = the address has never signed in. An existing account reads
  `active` with access at once. Either way the grant is recorded now, and she
  is emailed who added her to which project; a failed email still leaves the
  grant.
- An `owner` grants `admin` or `member`; an `admin` grants `member` only.
  `role: owner` is refused (`400`) — transfer is not a role change.
- `409` — the address is already a member; `429` — too many invitations from
  this account today.
- The address is the credential: a typo grants access to whoever holds it.
  Check the list for unexpected `pending` rows and remove a wrong one (step 4).

## 3. Watch them arrive

Nothing to accept and nothing expires. Ana signs in the ordinary way, with an
emailed code requested from the link in the invitation; receiving the code
proves the address is hers. Then read the list again as yourself:

CLI `naturali list-project-members` · SDK `naturali.projects.listProjectMembers`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/members" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "email": "you@acme.com", "status": "active", "role": "owner" },
    { "email": "ana@acme.com", "status": "active", "role": "member" }
  ]
}
```

- `status` is derived from whether the account has ever signed in — never
  stored — and she was a member the whole time she was `pending`. `null` means
  the account no longer exists.

## 4. Change their role, or let them go

Only the project `owner` may change a role.

CLI `naturali update-project-member` · SDK `naturali.projects.updateProjectMember`

```bash
curl -X PATCH "https://api.naturali.ai/v1/projects/$PROJECT/members/$MEMBER" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "role": "admin" }'
```

```json
{ "id": "pmem_3ZjkQ2mN8pRtYv7X", "email": "ana@acme.com", "status": "active", "role": "admin" }
```

Removing answers `204`:

CLI `naturali remove-project-member` · SDK `naturali.projects.removeProjectMember`

```bash
curl -X DELETE "https://api.naturali.ai/v1/projects/$PROJECT/members/$MEMBER" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

- An `owner` removes anyone; an `admin` removes a `member`, not another
  `admin`; **anyone may remove themselves**, whatever their role.
- The `owner`'s row answers `400` on both calls: it names who pays, and a
  project with no owner is unreachable.

Done when the list shows your colleague with the chosen `role` and
`status: "active"` after their first sign-in.

## Related skills

- `naturali-create-a-project` — a project to share, if you have none yet.
- `naturali-settle-an-approval` — with someone else in the project, the human deciding a held action can be a different person from the one paying.
