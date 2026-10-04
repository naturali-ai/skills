---
name: naturali-search-knowledge
description: Run a naturali.ai knowledge search over a project's ready documents (and memories) and read the ranked passages, their score and raw similarity_score - the same retrieval an agent runs before every generation. Use when asked to search the knowledge base, test retrieval or RAG, see what an agent will be shown, pick a min_score or limit, check why an agent ignores its documents, or find which document or chunk answers a question.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/answer-from-your-documents
---

# Search knowledge

Outcome: the passages a question retrieves from the project's documents,
ranked, with enough provenance (document, chunk, page, path) to cite them.
This is what an agent with `knowledge_config` is shown, so run it before wiring
or debugging one.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- At least one `ready` document, from `naturali-make-a-file-searchable`. The
  example searches the handbook filed under `/handbook/`.

Ids below are examples; use the ones your own calls return.

## 1. Search

CLI `naturali search-knowledge` · SDK `naturali.knowledge.searchKnowledge`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/knowledge/search" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cancel a custom cake the day before pickup",
    "document_paths": ["/handbook/"],
    "include_memories": false,
    "limit": 3
  }'
```

```json
{
  "results": [
    {
      "source_type": "document",
      "document_id": "doc_U92YTco33ny3EIi2",
      "chunk_id": "dchunk_cVoZTCNwwCkimF9M",
      "path": "/handbook/orchard-lane.md",
      "page": 1,
      "content": "# Orchard Lane Bakery — staff handbook\n\nCustom cake orders need 72 hours' notice. …",
      "score": 0.0164,
      "similarity_score": 0.7418
    }
  ]
}
```

- `score` orders the results; the ranking is the contract, the number is not.
  `similarity_score` is raw cosine (0–1), present only with a `query`.
- Note the `similarity_score` values: they are what a floor filters on.
  `min_similarity` here, `min_score` on an agent's `knowledge_config` — one
  filter, two names. A floor above what the corpus scores retrieves nothing,
  silently. The floor drops weak vector candidates only; a result that
  literally contains the searched token is kept.
- `document_paths` narrows documents by path prefix but does not leave
  memories out: a project with memories ranks them alongside, with
  `source_type: "memory"` (`memory_id`, `memory_store_id`). `include_memories:
  false` searches documents alone; `false` for both stores is `400`.
- At least one of `query`, `document_paths`, `document_ids`,
  `memory_store_ids` or `tags` is required (`400` otherwise). Without `query`
  the call is a fetch: no ranking, no `similarity_score`.
- `tags` keeps documents and memories whose tags contain every pair;
  `memory_store_ids` scopes memories to those stores.
- `limit` defaults to 10; above 100 it is clamped. `page` is `null` for plain
  text. Only `ready` documents are returned.
- A search is a read: nothing is written, the query is not stored, and it is
  never refused for credit.

Done when the passage that answers your question is in `results`, and you know
the `similarity_score` range your corpus returns.

## Related skills

- `naturali-ground-an-agent-in-documents` — give an agent this retrieval, with
  `limit` and `min_score` set from what you saw here.
- `naturali-make-a-file-searchable` — the corpus is empty or a document is not
  `ready` yet.
- `naturali-give-an-agent-long-term-memory` — where the memory results come from.
