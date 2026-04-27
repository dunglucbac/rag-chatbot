# Ingestion Plan: PDFs, Receipts, and OCR

## Goal
Build an ingestion pipeline that can handle:

- text-based PDFs
- scanned PDFs
- uploaded receipt images (`.png`, `.jpg`, `.webp`)
- payment screenshots
- future document types without rewriting the pipeline

The design should keep the API fast, push heavy work into workers, and make it easy to add more extraction or classification steps later.

## Design decision

### Broker choice
Use **RabbitMQ** for the workflow broker if the goal is to support multiple event types, explicit routing, retries, and future workflow expansion.

Why RabbitMQ fits this workflow better than Redis Streams:
- different file types need different processing paths
- PDF parsing, receipt extraction, and payment review are separate responsibilities
- the system may later fan out to more than one consumer per event
- retry and dead-letter handling are easier to organize by queue

### When Redis is still acceptable
Redis is fine for a first version if you want the simplest possible queue and already use Redis heavily. It is a good shortcut for a single background worker, but it becomes less expressive once routing and workflow branching grow.

## Proposed architecture

### 1) NestJS API layer
- Accept file uploads from the client.
- Store files in persistent storage instead of deleting them immediately.
- Create an `ingestion_job` record in Postgres.
- Publish a message to the broker.
- Return the job id immediately so the request stays fast.

### 2) Postgres job tracking
Use a table to track ingestion lifecycle.

Suggested statuses:
- `pending`
- `processing`
- `needs_review`
- `completed`
- `failed`

Suggested fields:
- `id`
- `original_filename`
- `storage_path`
- `mime_type`
- `file_type` (`pdf`, `image`)
- `classification` (`receipt`, `payment`, `document`, `unknown`)
- `status`
- `error_message`
- `created_at`
- `updated_at`
- `completed_at`

### 3) Queue topology
Use one topic exchange and route by event type.

Suggested exchange:
- `ingest.topic`

Suggested queues:
- `queue.doc.pdf.parse`
- `queue.image.classify`
- `queue.receipt.persist`
- `queue.payment.review`
- `queue.retry.*`
- `queue.dlq.*`

Suggested event names / routing keys:
- `ingest.file.detected`
- `doc.pdf.parse.requested`
- `image.classify.requested`
- `receipt.persist.requested`
- `payment.review.requested`
- `job.failed`

### 4) Python worker services
Use Python for parsing and classification because the document/OCR tooling is richer there.

Recommended worker split:
- PDF parser worker
- image classifier worker
- receipt persistence worker
- payment review worker
- retry / dead-letter handler

## Message payload

Keep every message wrapped in a common envelope.

Common fields:
- `event_id`
- `event_type`
- `user_id`
- `job_id`
- `file_id`
- `file_type`
- `storage_uri`
- `mime_type`
- `correlation_id`
- `attempt`
- `created_at`

Optional fields for PDFs:
- `page_count`
- `checksum`
- `parse_hint`

Optional fields for images:
- `image_width`
- `image_height`
- `ocr_hint`
- `source_context`

Optional fields for downstream classification:
- `classification`
- `merchant`
- `amount`
- `confidence`
- `notes`

Example payload shape:

```json
{
  "event_id": "evt_123",
  "event_type": "doc.pdf.parse.requested",
  "user_id": "user_7",
  "job_id": "job_abc",
  "file_id": "file_abc",
  "file_type": "pdf",
  "storage_uri": "s3://bucket/file.pdf",
  "mime_type": "application/pdf",
  "correlation_id": "req_99",
  "attempt": 1,
  "created_at": "2026-04-27T10:00:00Z"
}
```

## Workflow by file type

### PDF workflow
1. Client uploads a PDF.
2. Ingestion service detects `pdf`.
3. Service saves the file and creates a job record.
4. Service publishes `doc.pdf.parse.requested`.
5. PDF parser worker tries text extraction first.
6. If the PDF is scanned or text is weak, worker falls back to OCR.
7. Worker stores normalized content and metadata.
8. Worker emits completion or failure event.

### Image workflow
1. Client uploads an image.
2. Ingestion service detects image type.
3. Service publishes `image.classify.requested`.
4. Image classifier worker decides whether the image is a receipt or a payment screenshot.
5. If it is a receipt, worker publishes `receipt.persist.requested`.
6. If it is a banking or payment screenshot, worker publishes `payment.review.requested`.
7. If classification confidence is low, route to review instead of auto-saving.

### Receipt workflow
1. Receipt is classified.
2. Receipt persistence worker extracts structured fields if available.
3. Worker saves receipt data linked to the user/account.
4. Worker marks the job complete.

### Payment screenshot workflow
1. Image is classified as a payment or banking transaction screenshot.
2. Review worker creates a pending follow-up task.
3. The app later asks the user what they spent.
4. Once the user confirms, the transaction can be categorized and stored.

## OCR strategy
Docling supports OCR for scanned PDFs and embedded bitmaps.
It can work with multiple OCR engines:

- EasyOCR
- Tesseract
- RapidOCR
- OcrMac

Recommended approach:

### Primary OCR choice
Start with one OCR engine that is easiest to deploy in your environment.

Good defaults:
- **Tesseract** if you want a mature open-source baseline
- **RapidOCR** if you want a lightweight modern option
- **OcrMac** if you are targeting local macOS developer workflows

### Fallback strategy
- Try direct PDF text extraction first.
- If little or no text is found, fall back to OCR.
- Use OCR for receipt images and scanned PDFs automatically.

### Why OCR matters for receipts
Receipts often contain:
- tiny text
- skewed scans
- low-contrast photos
- embedded bitmap text inside PDFs

That is exactly where OCR adds value.

## What to store in the vector database
For each chunk, keep metadata such as:
- source job id
- file name
- page number
- chunk index
- document type
- OCR engine used
- confidence / extraction notes if available

This will make search, debugging, and reprocessing much easier.

## Why this design is better than synchronous ingestion
- Handles large files safely
- Supports scanned PDFs and receipts
- Works across multiple app instances
- Enables retries and failure tracking
- Keeps NestJS responsive
- Lets Python own the complex parsing logic
- Makes future receipt and payment workflows easy to add

## Implementation phases

### Phase 1
- Add ingestion job table
- Change upload flow to store files persistently
- Return job id immediately
- Add queue publish on upload

### Phase 2
- Add broker producer in NestJS
- Add Python worker consumers
- Implement status updates and retries

### Phase 3
- Integrate Docling parsing
- Add OCR fallback for scanned PDFs and images
- Add receipt-specific metadata extraction
- Add payment screenshot classification path

### Phase 4
- Add dead-letter handling and monitoring
- Improve chunk metadata and search quality
- Add user review flow for payment screenshots

## Suggested next step
Implement the job table, routing keys, and upload/status API first, then wire in the Python workers and OCR pipeline.
