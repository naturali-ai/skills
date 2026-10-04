---
name: naturali-answer-from-images-and-audio
description: Upload a photo and a voice recording to naturali.ai, let managed conversion turn them into text documents, read what conversion wrote, and scope the agent's retrieval to them by editing its formation template (plan, then update) so it answers from what the media contain. Use when asked to make a naturali agent answer from images, screenshots, receipts, audio, voice memos or scanned PDFs, transcribe or OCR files for retrieval, or check the managed conversion ingestion rules.
license: Apache-2.0
metadata:
  author: naturali.ai
  source: https://docs.naturali.ai/docs/tutorials/answer-from-images-and-audio
---

# Answer from images and audio

Outcome: an agent that answers from a photo and a voice recording you uploaded
— proven by a question only those two files can answer.

## Before you start

- `NATURALI_TOKEN`, `PROJECT`, `PROVIDER`, `AGENT`, `FORMATION` and its
  template `agent.yaml` — an agent with retrieval deployed from a formation,
  from `naturali-answer-from-your-documents`.
- `jq`, to put the template file into the JSON body.
- Two files in the current directory: `receipt.png` (any receipt) and
  `meeting.mp3` (a short voice memo with one fact). The responses below come
  from a café receipt and "Launch is next Tuesday."; ask about what yours say.
- Each conversion is a generation on a naturali model, billed from credit: a
  project with a negative balance cannot ingest. Converted documents count
  towards the account's storage allowance.

Ids below are examples; use the ones your own calls return. Every call is also
a CLI command (`naturali <operationId-kebab>`) and an SDK method
(`naturali.<module>.<operationId>`), named under each step.

## 1. See the conversion rules

Every project already holds three managed ingestion rules: `audio/*`,
`image/*` and `application/pdf` (scans only). Nothing to set up.

CLI `naturali list-ingestion-rules` · SDK `naturali.ingestionRules.listIngestionRules`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/ingestion-rules" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{
  "data": [
    { "content_type_glob": "audio/*", "chunk_strategy": "whole", "metadata": { "naturali_managed": "conversion" } },
    { "content_type_glob": "image/*", "chunk_strategy": "whole", "metadata": { "naturali_managed": "conversion" } },
    { "content_type_glob": "application/pdf", "chunk_strategy": null, "metadata": { "naturali_managed": "conversion" } }
  ]
}
```

- `naturali_managed` rules are read-only; your own rule on a narrower type
  (e.g. `image/png`) wins over them.
- No `naturali_managed` rules means conversion is off for the project.

## 2. Upload the photo

- `content_type` picks the rule, so send the real one.
- Uploads and ingests stay direct calls: a `file` resource cannot carry bytes,
  and a `document` resource takes inline `content`, not a `file_id`.

CLI `naturali upload-file-base64` · SDK `naturali.files.uploadFileBase64`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/files/upload/base64" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"$(base64 -w0 receipt.png)\",
    \"filename\": \"receipt.png\",
    \"prefix\": \"/media\",
    \"content_type\": \"image/png\"
  }"
```

```json
{ "id": "file_oKGatOttNow3AAw4", "path": "/media/receipt.png", "content_type": "image/png" }
```

```bash
export RECEIPT=file_oKGatOttNow3AAw4
```

## 3. Upload the recording

CLI `naturali upload-file-base64` · SDK `naturali.files.uploadFileBase64`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/files/upload/base64" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"$(base64 -w0 meeting.mp3)\",
    \"filename\": \"meeting.mp3\",
    \"prefix\": \"/media\",
    \"content_type\": \"audio/mpeg\"
  }"
```

```json
{ "id": "file_6ICGzQzyyOtCKIeD", "path": "/media/meeting.mp3", "content_type": "audio/mpeg" }
```

```bash
export RECORDING=file_6ICGzQzyyOtCKIeD
```

## 4. Ingest the photo

The same call as for a text file; the `image/*` rule sends it to the converter
and the text it reads back becomes the document.

CLI `naturali ingest-document` · SDK `naturali.documents.ingestDocument`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/documents/ingest" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"file_id\": \"$RECEIPT\", \"path_prefix\": \"/media/\" }"
```

```json
{ "id": "doc_O46t8imSw0p6b4kz", "path": "/media/receipt.png", "status": "pending" }
```

```bash
export RECEIPT_DOC=doc_O46t8imSw0p6b4kz
```

## 5. Ingest the recording

The `audio/*` rule transcribes it.

CLI `naturali ingest-document` · SDK `naturali.documents.ingestDocument`

```bash
curl -X POST "https://api.naturali.ai/v1/projects/$PROJECT/documents/ingest" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"file_id\": \"$RECORDING\", \"path_prefix\": \"/media/\" }"
```

```json
{ "id": "doc_Vigfer3NrGJ93rRD", "path": "/media/meeting.mp3", "status": "pending" }
```

```bash
export RECORDING_DOC=doc_Vigfer3NrGJ93rRD
```

## 6. Wait until both are ready

Conversion runs in the background; poll each document until `ready` (a few
seconds for short files). Shown for the photo; repeat with `$RECORDING_DOC`.

CLI `naturali get-document-status` · SDK `naturali.documents.getDocumentStatus`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/documents/$RECEIPT_DOC/status" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "doc_O46t8imSw0p6b4kz", "status": "ready", "chunk_count": 1, "progress": 100 }
```

- An image or a recording becomes a single chunk. `failed` carries the reason
  in `error`.

## 7. Read what conversion wrote

`content` is exactly what retrieval will hand the agent. Shown for the photo;
repeat with `$RECORDING_DOC`.

CLI `naturali get-document` · SDK `naturali.documents.getDocument`

```bash
curl "https://api.naturali.ai/v1/projects/$PROJECT/documents/$RECEIPT_DOC" \
  -H "Authorization: Bearer $NATURALI_TOKEN"
```

```json
{ "id": "doc_O46t8imSw0p6b4kz", "status": "ready", "content": "Corner Cafe\nCoffee 3.50\nSandwich 8.00\n\nTotal amount: 11.50" }
```

- The recording read `"content": "Launch is next Tuesday."`
- Wrong text here means a wrong answer later: fix the source file, then re-run
  with `POST /v1/projects/{project_id}/documents/{document_id}/ingest`.

## 8. Point the agent at the media

Scope retrieval to `/media/`; list `/handbook/` too if the agent should keep
answering from the handbook. Edit the `Agent` resource in `agent.yaml`:

```yaml
  Agent:
    type: agent
    properties:
      name: refund-explainer
      ai_provider_id:
        param: ProviderId
      instructions: "Answer from the provided context only. When it does not cover the question, answer only: I do not know."
      knowledge_config:
        document_paths:
          - /media/
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
  "physical_resource_id": "agent_lD7mNEur9S1cIuAQ" }] }
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
  "outputs": { "agent_id": "agent_lD7mNEur9S1cIuAQ" } }
```

- Check `error` as well as `status`: an `active` formation can still carry one.
  The agent is now at `version` 3.
- Keep "answer only: I do not know": a looser instruction let the model append
  it to an answer it had already given. Quote it in YAML: it contains `: `.
- Only when the user asks for direct calls: `PATCH …/agents/{agent_id}` with
  `instructions` and `knowledge_config` (CLI `naturali patch-agent` · SDK
  `naturali.agents.patchAgent`).

## 9. Ask what only the media knows

CLI `naturali create-agent-generation` · SDK `naturali.agents.createAgentGeneration`

```bash
curl -X POST \
  "https://api.naturali.ai/v1/projects/$PROJECT/agents/$AGENT/generate?wait=true" \
  -H "Authorization: Bearer $NATURALI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "What did I spend at the cafe, and when is the launch?" }] }'
```

```json
{
  "id": "gen_p8YcysDsFiqABrCx", "status": "completed",
  "output": { "content": "You spent $11.50 at the cafe. The launch is next Tuesday.", "finish_reason": "stop" }
}
```

Done when `output.content` carries both facts — one read off the photo, one
heard in the recording — with no text you typed.

## Related skills

- `naturali-answer-from-your-documents` — the same retrieval over text documents.
- `naturali-score-an-agent-change` — keep questions like step 9 in a suite.
