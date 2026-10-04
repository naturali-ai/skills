---
name: naturali-make-a-file-searchable
description: Upload a file (Markdown, text, PDF, photo or voice recording) to a naturali.ai project and ingest it into a searchable document, reading the text conversion wrote for images, audio and scans. Use when asked to upload or index a file, add a handbook, PDF, screenshot, receipt or voice memo to the knowledge base, OCR or transcribe a file, or on 409 FILE_ALREADY_INGESTED, 413, 402 insufficient_credit or a document stuck pending or failed.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/answer-from-your-documents
---

# Make a file searchable

Outcome: a file stored in the project and turned into a `ready` document, so
knowledge search and agents can retrieve it. Images, audio and scanned PDFs
are converted to text on the way in, with no setup.

## Before you start

- `NATURALI_TOKEN` — a `nat_sk_…` project API key; `PROJECT` — the project id,
  from `naturali-create-a-project`.
- The file in the current directory. The examples use `orchard-lane.md`, a
  handbook no model was trained on; `receipt.png` and `meeting.mp3` show media.
- Indexing embeds the text, paid from credit on every plan: a negative balance
  refuses the ingest with `402 insufficient_credit`. Each conversion of an
  image, recording or scan is also a billed generation. Documents count towards
  the account's storage (`403 plan_limit_reached`, `resource: "storage"`).

Ids below are examples; use the ones your own calls return. Uploading bytes and
ingesting are actions, so this skill uses direct calls, not a formation. Text
you already hold as a string needs no upload: declare a `document` resource
(`content`, `path`) in `naturali.yaml`; it is indexed during the deploy.

## 1. See the conversion rules (media only)

CLI `naturali list-ingestion-rules` · SDK `naturali.ingestionRules.listIngestionRules`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/ingestion-rules" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "id": "igr_ASGQESjiW8Bl5Fr2", "content_type_glob": "audio/*", "chunk_strategy": "whole",
      "metadata": { "naturali_managed": "conversion", "template_version": 1 } },
    { "id": "igr_1NeKM3KrWrHY7XPj", "content_type_glob": "image/*", "chunk_strategy": "whole",
      "metadata": { "naturali_managed": "conversion", "template_version": 1 } },
    { "id": "igr_gceI7aE0gDsSVhml", "content_type_glob": "application/pdf", "chunk_strategy": null,
      "metadata": { "naturali_managed": "conversion", "template_version": 1 } }
  ]
}
```

- `application/pdf` converts only a PDF with no text layer (a scan).
- The `naturali_managed` rules are read-only (`403 managed_resource_read_only`).
  A rule of your own on a narrower type (`image/png`) wins over them.
- No `naturali_managed` rules means conversion is off: `managed_conversion: true`
  on `PATCH /v1/projects/{project_id}` (needs `admin`) turns it back on.
- Text, Markdown and PDFs with text need no rule. Any other type needs an
  ingestion rule naming a converter, or the ingest is `400`.

## 2. Upload the file

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
{
  "id": "file_FHQCMvpqtwyOhM4J",
  "path": "/handbook/orchard-lane.md",
  "content_type": "text/markdown",
  "size": 263
}
```

```bash
export FILE=file_FHQCMvpqtwyOhM4J
```

- `content_type` decides how the file is read and which conversion rule picks
  it: send the real one (`text/markdown`, `text/plain`, `application/pdf`,
  `image/png`, `audio/mpeg`).
- Media goes the same way, e.g. `receipt.png` with `"prefix": "/media"` and
  `"content_type": "image/png"`.
- Large files: multipart, CLI `naturali upload-file` · SDK
  `naturali.files.uploadFile` · `POST …/files/upload` with
  `-F "file=@handbook.pdf;type=application/pdf" -F prefix=/handbook`. Past the
  upload ceiling (25 MB by default) it is `413 UPLOAD_TOO_LARGE`.

## 3. Ingest it

CLI `naturali ingest-document` · SDK `naturali.documents.ingestDocument`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/documents/ingest" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"file_id\": \"$FILE\", \"path_prefix\": \"/handbook/\" }"
```

```json
{
  "id": "doc_U92YTco33ny3EIi2",
  "file_id": "file_FHQCMvpqtwyOhM4J",
  "path": "/handbook/orchard-lane.md",
  "status": "pending",
  "version": 1
}
```

```bash
export DOCUMENT=doc_U92YTco33ny3EIi2
```

- `path_prefix` files the document; agents and search scope to it by prefix
  (`document_paths: ["/handbook/"]`), so choose it deliberately.
- Background by default: `202` with `status: pending`. `?wait=true` answers
  `201` with a `ready` document — fine for a small file; one too large to wait
  for answers `413`.
- `chunk_strategy`: `page` (default, one chunk per PDF page), `whole`, or
  `size` with `chunk_size` (1000) and `chunk_overlap` (200). An image or a
  recording becomes a single chunk.
- A file backs one document: a second ingest is `409 FILE_ALREADY_INGESTED`.
  Upload a copy to index it under another path.

## 4. Wait until it is ready

CLI `naturali get-document-status` · SDK `naturali.documents.getDocumentStatus`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/documents/$DOCUMENT/status" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "id": "doc_U92YTco33ny3EIi2",
  "status": "ready",
  "chunk_count": 1,
  "total_chunks": 1,
  "total_pages": 1,
  "progress": 100
}
```

- Only `ready` documents are searched. Poll until `ready` or `failed`; short
  files take seconds.
- `failed` carries the reason in `error` (`FILE_PARSE_FAILED`,
  `INGESTION_TIMEOUT`). Re-run against the same file, optionally with another
  `chunk_strategy`: CLI `naturali reingest-document` · SDK
  `naturali.documents.reingestDocument` · `POST …/documents/$DOCUMENT/ingest`.

## 5. Read what conversion wrote (media only)

With `DOCUMENT` set to the photo's or recording's document id:

CLI `naturali get-document` · SDK `naturali.documents.getDocument`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/documents/$DOCUMENT" \
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

- `content` is exactly what retrieval hands an agent. A recording reads as its
  transcript (`"Launch is next Tuesday."`). If it is wrong, fix the source and
  reingest; the agent's answer can be no better.

Done when the status reads `ready` (and, for media, `content` holds the text
you expect).

## Related skills

- `naturali-search-knowledge` — see the passages a question retrieves from it.
- `naturali-ground-an-agent-in-documents` — make an agent answer from it.
- `naturali-deploy-a-formation` — declare text documents and ingestion rules.
