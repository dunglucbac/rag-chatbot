# Ingestion Plan: PDFs, Receipts, and OCR

## Goal
Upgrade ingestion so the app can handle:

- text-based PDFs
- scanned PDFs
- uploaded receipt images (`.png`, `.jpg`, `.webp`)
- future document types without rewriting the pipeline

## Proposed Architecture

### 1) NestJS API layer
- Accept file uploads from the client.
- Store files in local persistent storage instead of deleting them immediately.
- Create an `ingestion_job` record in Postgres.
- Enqueue a job to Redis Stream.
- Return a job id immediately so the request stays fast.

### 2) Postgres job tracking
Use a table to track ingestion lifecycle.

Suggested statuses:
- `pending`
- `processing`
- `completed`
- `failed`

Suggested fields:
- `id`
- `original_filename`
- `storage_path`
- `mime_type`
- `source_type` (`pdf`, `image`, `receipt`)
- `status`
- `error_message`
- `created_at`
- `updated_at`
- `completed_at`

### 3) Redis Stream worker queue
- Python worker reads jobs from Redis Stream.
- Worker loads the file from storage.
- Worker decides whether to use text extraction or OCR.
- Worker writes extracted content and metadata back to Postgres and/or the vector store.
- Worker updates job status.

### 4) Python parsing worker
Use Python for document parsing because Docling already supports richer PDF/OCR workflows.

Recommended flow:
1. Detect file type.
2. For normal PDFs, try text extraction first.
3. For scanned PDFs or image uploads, use OCR.
4. Split extracted text into chunks.
5. Store chunks with page and document metadata.
6. Mark the job complete.

## OCR Strategy
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

## Recommended ingestion decision tree

1. **Upload received**
2. **Save file to persistent storage**
3. **Create job record**
4. **Enqueue Redis Stream message**
5. **Python worker consumes job**
6. **If file is image** → OCR path
7. **If file is PDF** → text extraction first
8. **If text extraction is poor** → OCR fallback
9. **Chunk text and store embeddings**
10. **Update job status in Postgres**

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
- Allows Python to own the complex parsing logic

## Implementation phases

### Phase 1
- Add ingestion job table
- Change upload flow to store files persistently
- Return job id immediately

### Phase 2
- Add Redis Stream producer in NestJS
- Add Python worker consumer
- Implement status updates

### Phase 3
- Integrate Docling parsing
- Add OCR fallback for scanned PDFs and images
- Add receipt-specific metadata extraction if needed

### Phase 4
- Add job retries, dead-letter handling, and monitoring
- Improve chunk metadata and search quality

## Suggested next step
Implement the job table and upload/status API first, then wire in the Python worker and OCR pipeline.
