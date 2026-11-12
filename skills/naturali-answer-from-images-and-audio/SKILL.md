---
name: naturali-answer-from-images-and-audio
description: Make a naturali.ai agent answer from a photo and a voice recording by uploading them, letting managed conversion turn them into text documents, and scoping the agent's retrieval to them. Use when asked to answer from images, screenshots, receipts, scans, voice memos or audio, OCR or transcribe files for an agent, or when conversion seems off, and on 402 insufficient_credit, 409 FILE_ALREADY_INGESTED or a media document failed.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://naturali.ai/docs/tutorials/answer-from-images-and-audio
---

# Answer from images and audio

Outcome: an agent that answers from a photo and a voice recording you
uploaded, proven by one question only those two files can answer.

There is no converter to set up: every project turns images, audio and scanned
PDFs into text on the way in (managed conversion). Agents never receive the
media itself, only the text conversion wrote.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id.
- `Agent` in `naturali.yaml` with `AGENT` exported, from
  `naturali-create-an-agent`.
- Two files in the current directory: `receipt.png` (a photo of a receipt)
  and `meeting.mp3` (a short voice memo with one fact, e.g. "Launch is next
  Tuesday.").
- Each conversion is a generation on a model naturali provides, billed from
  credit; a negative balance cannot ingest (`402 insufficient_credit`). The
  converted documents count towards the account's storage.

Ids below are examples; use the ones your own calls return.

## 1. Check that conversion is on

List the ingestion rules (CLI `naturali list-ingestion-rules` · SDK
`naturali.ingestionRules.listIngestionRules` · `GET …/ingestion-rules`), as in
step 1 of `naturali-make-a-file-searchable`. Expect three rules with
`metadata.naturali_managed: "conversion"`, for `audio/*`, `image/*` and
`application/pdf` (scans only).

- None means conversion is off for the project: `managed_conversion: true`
  on `PATCH /v1/projects/{project_id}` (needs `admin`) turns it back on.
- The managed rules are read-only; a rule of your own on a narrower type
  (`image/png`) wins over them.

## 2. Upload and ingest both files under `/media/`

Follow steps 2 to 4 of `naturali-make-a-file-searchable` once per file:

| File | `content_type` | `prefix` | `path_prefix` |
| --- | --- | --- | --- |
| `receipt.png` | `image/png` | `/media` | `/media/` |
| `meeting.mp3` | `audio/mpeg` | `/media` | `/media/` |

```bash
export RECEIPT_DOC=doc_O46t8imSw0p6b4kz     # the photo's document id
export RECORDING_DOC=doc_Vigfer3NrGJ93rRD   # the recording's document id
```

- `content_type` picks the rule, so send the real one.
- Conversion runs in the background: poll each document's status until
  `ready` (short files take seconds). An image or a recording becomes a single
  chunk; `failed` carries the reason in `error`.

## 3. Read what conversion wrote

CLI `naturali get-document` · SDK `naturali.documents.getDocument`

```bash
curl -sS "https://api.naturali.ai/v1/projects/$PROJECT/documents/$RECEIPT_DOC" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "doc_O46t8imSw0p6b4kz",
  "path": "/media/receipt.png",
  "content_type": "image/png",
  "status": "ready",
  "content": "Corner Cafe\nCoffee 3.50\nSandwich 8.00\n\nTotal amount: 11.50"
}
```

Run it again with `$RECORDING_DOC`: `"content": "Launch is next Tuesday."`.
`content` is exactly what retrieval hands the agent; if it is wrong, fix the
source file and reingest (CLI `naturali reingest-document` ·
`POST …/documents/{document_id}/ingest`).

## 4. Point the agent at the media

Edit `Agent` in `naturali.yaml` and apply with `naturali-deploy-a-formation`
(details in `naturali-ground-an-agent-in-documents`):

```yaml
  Agent:
    type: agent
    properties:
      name: support
      ai_provider_id: { ref: Provider }
      instructions: "Answer from the provided context only. When it does not cover the question, answer only: I do not know."
      knowledge_config:
        document_paths: [/media/]     # add /handbook/ etc. to keep other sources
        limit: 3
```

## 5. Ask what only the media knows

The total is only in the photo, the launch date only in the recording.

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -sS -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What did I spend at the cafe, and when is the launch?" }] }'
```

```json
{
  "id": "gen_p8YcysDsFiqABrCx",
  "status": "completed",
  "output": {
    "content": "You spent $11.50 at the cafe. The launch is next Tuesday.",
    "finish_reason": "stop"
  }
}
```

Done when the answer carries one fact read off the photo and one heard in the
recording.

## Related skills

- `naturali-make-a-file-searchable` — upload, ingest, status and errors in full.
- `naturali-ground-an-agent-in-documents` — `knowledge_config` options and `min_score`.
- `naturali-search-knowledge` — see what a question retrieves from the media.
- `naturali-score-an-agent-change` — keep questions like step 5 in a suite.
