---
name: naturali-ground-an-agent-in-documents
description: Give a naturali.ai agent retrieval over the project's documents with knowledge_config (document_paths, limit, min_score). Use when asked to make an agent answer from documents, a handbook, PDFs, photos or recordings, add RAG to an agent, stop it guessing beyond its sources, scope it to part of the corpus, or when an agent ignores documents it should know.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/answer-from-your-documents
---

# Ground an agent in documents

Outcome: an agent that searches the documents before every generation, with
the user's message as the query, and answers from what it finds — proven by a
fact only the documents hold.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml`, from `naturali-create-an-agent`, and `AGENT`
  exported. Use your template's logical id if it differs.
- `ready` documents under a path prefix (here `/handbook/`; `/media/` for a
  converted photo or recording), from `naturali-make-a-file-searchable`.
- The `similarity_score` range a typical question returns, from
  `naturali-search-knowledge`, if you will set `min_score`.

Ids below are examples; use the ones your own calls return.

## 1. Declare the agent's knowledge

Edit `Agent` in `naturali.yaml`:

```yaml
resources:
  Agent:
    type: agent
    properties:
      name: support
      ai_provider_id: { ref: Provider }
      instructions: "Answer from the provided context only. When it does not cover the question, answer only: I do not know."   # changed
      knowledge_config:            # added
        document_paths: [/handbook/]
        limit: 3
```

Apply it with `naturali-deploy-a-formation`. The plan should report:

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update" }] }
```

- `document_paths` matches on prefix. List several (`[/handbook/, /media/]`)
  to keep answering from each; omit both it and `document_ids` and every
  document in the project is in scope.
- `document_ids` names specific documents; `{ ref: … }` works for a
  `document` resource in the same template.
- `limit` is a budget: every chunk it admits goes into the context of every
  generation.
- `min_score` is a raw cosine floor (0–1), the filter search calls
  `min_similarity`. Omitted, there is no floor. Set above what the corpus
  scores, it fails silently: nothing is retrieved, the generation succeeds, and
  the agent answers without its documents.
- `tags` keeps documents (and memories) whose tags contain every pair.
- The instruction makes the agent say when the documents do not cover a
  question. Ask for *only* "I do not know": a looser wording let the model
  append it to an answer it had already given.
- A `knowledge_config` change is a config change: the agent moves to a new
  `version`.
- Without a formation (only when the user asks): `PATCH …/agents/$AGENT` with
  the same `instructions` and `knowledge_config` (CLI `naturali patch-agent` ·
  SDK `naturali.agents.patchAgent`).

## 2. Ask what only the documents know

The 30% deposit is in the handbook and nowhere else, so an answer that names it
came from retrieval. Full generation options are in `naturali-run-a-generation`.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Can I cancel a custom cake the day before pickup and get my money back?" }] }'
```

```json
{
  "id": "gen_g9pZ4QQPxHNjYVWR",
  "status": "completed",
  "output": {
    "content": "No, you cannot cancel a custom cake the day before pickup and get a full refund. You can cancel for a full refund up to 48 hours before pickup. After that time, the 30% deposit is kept.",
    "finish_reason": "stop"
  }
}
```

- From media: "What did I spend at the cafe, and when is the launch?" answered
  "You spent $11.50 at the cafe. The launch is next Tuesday." — one fact read
  off a photo, one heard in a recording.
- Ask something the documents do not cover ("Do you sell gluten-free bread?"):
  the agent should answer that it does not know.
- A wrong or empty answer: run the same question through
  `naturali-search-knowledge` with the agent's `document_paths` and
  `min_similarity` set to its `min_score`. No passage there means no passage
  for the agent.

Done when the answer carries a fact only the documents hold, and an
out-of-scope question gets "I do not know".

## Related skills

- `naturali-search-knowledge` — see exactly what the agent is shown.
- `naturali-make-a-file-searchable` — add more documents, photos or recordings.
- `naturali-give-an-agent-long-term-memory` — the same `knowledge_config`, fed
  by facts the agent learns.
- `naturali-score-an-agent-change` — turn questions like step 2 into a suite.
