---
name: naturali-answer-from-your-documents
description: Upload a file to naturali.ai, ingest it into a searchable document, wait until it is ready, test retrieval with knowledge search, and give the agent a knowledge_config by editing its formation template (plan, then update) so it answers from the document instead of model memory. Use when asked to ground a naturali agent in documents, add RAG or retrieval, upload and index a PDF, Markdown or text file, search a project's knowledge, or make an agent answer only from provided context.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/answer-from-your-documents
---

# Answer from your documents

Outcome: an agent that answers from a document you uploaded — proven by a
question only that document can answer.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` API key (or a session JWT).
- `PROJECT`, `PROVIDER`, `AGENT`, `FORMATION` and its template `agent.yaml` —
  a working agent deployed from a formation, from
  `naturali-first-agent-generation`.
- `jq`, to put the template file into the JSON body.
- A document the model cannot already know (a made-up handbook works):

```bash
cat > orchard-lane.md <<'EOF'
# Orchard Lane Bakery — staff handbook

Custom cake orders need 72 hours' notice.

A custom cake can be cancelled for a full refund up to 48 hours before
pickup. After that, the 30% deposit is kept.

Deliveries run Tuesday to Saturday, within 8 km of the shop.
EOF
```

- Indexing embeds the text, paid from credit on every plan: a negative balance
  refuses the ingest with `402 insufficient_credit`. The document counts
  towards the account's storage allowance.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. Upload the document

- `content_type` matters: ingestion reads `text/markdown`, `text/plain` and
  `application/pdf` directly.
- A direct call, not a formation resource: a `file` resource registers a record
  and cannot carry the bytes.

CLI `naturali upload-file-base64` · SDK `naturali.files.uploadFileBase64`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/files/upload/base64" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"$(base64 -w0 orchard-lane.md)\",
    \"filename\": \"orchard-lane.md\",
    \"prefix\": \"/handbook\",
    \"content_type\": \"text/markdown\"
  }"
```

```json
{ "id": "file_FHQCMvpqtwyOhM4J", "path": "/handbook/orchard-lane.md", "content_type": "text/markdown" }
```

```bash
export FILE=file_FHQCMvpqtwyOhM4J
```

## 2. Ingest it

Splits the file into chunks and embeds each. `path_prefix` files it under
`/handbook/`, which scopes the agent in step 5.

CLI `naturali ingest-document` · SDK `naturali.documents.ingestDocument`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/documents/ingest" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"file_id\": \"$FILE\", \"path_prefix\": \"/handbook/\" }"
```

```json
{ "id": "doc_U92YTco33ny3EIi2", "path": "/handbook/orchard-lane.md", "status": "pending", "version": 1 }
```

- Background by default: `202` with `status: pending`.
- A direct call: a `document` resource takes inline `content`, not a `file_id`
  or `path_prefix`, so it cannot ingest an uploaded file.
- A scanned PDF, an image or audio is converted on the way in, billed as a
  generation.

```bash
export DOCUMENT=doc_U92YTco33ny3EIi2
```

## 3. Wait until it is ready

Searchable only once `ready`; poll:

CLI `naturali get-document-status` · SDK `naturali.documents.getDocumentStatus`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/documents/$DOCUMENT/status" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "doc_U92YTco33ny3EIi2", "status": "ready", "chunk_count": 1, "progress": 100 }
```

- `failed` carries the reason in `error`;
  `POST /v1/projects/{project_id}/documents/{document_id}/ingest` re-runs it
  against the same file.
- To skip polling, add `?wait=true` to the ingest (CLI `--wait true`, SDK
  `query: { wait: true }`): it answers `201` with a `ready` document. A large
  file outlives the request and answers `413`.

## 4. Search it

The same retrieval the agent runs before every generation.

CLI `naturali search-knowledge` · SDK `naturali.knowledge.searchKnowledge`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/knowledge/search" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cancel a custom cake the day before pickup",
    "document_paths": ["/handbook/"],
    "limit": 3
  }'
```

```json
{
  "results": [{ "source_type": "document", "document_id": "doc_U92YTco33ny3EIi2",
    "path": "/handbook/orchard-lane.md", "content": "# Orchard Lane Bakery — staff handbook\n\n…",
    "score": 0.0164, "similarity_score": 0.7418 }]
}
```

- `score` orders results; `similarity_score` is the raw cosine value a floor
  filters on. Note it: a floor above what your corpus scores retrieves nothing.
- `document_paths` does not exclude memories (`source_type: "memory"`); add
  `"include_memories": false` to search documents alone.

## 5. Give the agent the document

`knowledge_config` makes every generation search first, with the user's message
as the query. Without `document_paths`, all project documents are in scope. Edit
the `Agent` resource in `agent.yaml`:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: Answer from the provided context only. If it does not cover the question, say you do not know.
      knowledge_config:
        document_paths:
          - /handbook/
        limit: 3
```

Plan against the deployed formation (creates nothing), then apply:

CLI `naturali plan-formation` · SDK `naturali.formations.planFormation`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/formations/plan" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg f "$FORMATION" --arg p "$PROVIDER" \
        '{formation_id: $f, template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "changes": [{ "logical_id": "Agent", "resource_type": "agent", "action": "update",
  "physical_resource_id": "agent_404tjqHnUXhpxlUn" }] }
```

CLI `naturali update-formation` · SDK `naturali.formations.updateFormation`

```bash
curl -X PUT "https://api.naturali.ai/v1/projects/$PROJECT/formations/$FORMATION" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rn --rawfile t agent.yaml --arg p "$PROVIDER" \
        '{template: $t, parameters: {ProviderId: $p}}')"
```

```json
{ "id": "form_EPis15Nfukary167", "status": "active", "error": null,
  "outputs": { "agent_id": "agent_404tjqHnUXhpxlUn" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
- `ProviderId` has no default, so every plan and update passes it again.
- `limit` is a budget: every admitted chunk goes into the context of every
  generation. A `knowledge_config` change bumps the agent to `version` 2.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` and `knowledge_config` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 6. Ask what only the document knows

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
  "id": "gen_g9pZ4QQPxHNjYVWR", "status": "completed",
  "output": { "content": "No, you cannot cancel a custom cake the day before pickup and get a full refund. You can cancel for a full refund up to 48 hours before pickup. After that time, the 30% deposit is kept.", "finish_reason": "stop" }
}
```

Done when `output.content` names the 48-hour window and the 30% deposit — facts
only the document holds. A question the handbook does not cover ("Do you sell
gluten-free bread?") should get "do not know".

## Related skills

- `naturali-answer-from-images-and-audio` — the same agent, answering from a photo and a recording.
- `naturali-score-an-agent-change` — turn questions like step 6 into a suite.
