# ADR 0001: Event-Driven Python Worker for File Ingestion

**Status:** Accepted  
**Date:** 2026-05-05  
**Deciders:** Thomas

## Context

Users upload receipts, payment screenshots, and knowledge documents via Telegram. These files need to be:
- Classified (receipt vs payment; all other files follow the document path)
- Extracted (OCR or text extraction)
- Parsed (line items for receipts, metadata for documents)
- Stored (relational data for receipts, embeddings for documents)

The existing NestJS monolith handles uploads and creates ingestion jobs, but doesn't process the files.

## Decision

We will build a separate **Python Worker** that:

1. **Consumes events from RabbitMQ:**
   - `doc.pdf.parse.requested`
   - `image.classify.requested`

2. **Extracts text using a two-path strategy:**
   - Text-based PDFs → PyPDF2/pdfplumber (free, fast)
   - Image-based PDFs and images → Tesseract OCR (free, decent accuracy)
   - Detection: attempt text extraction; if < 50 chars, fall back to OCR

3. **Classifies using LLM:**
   - Claude Haiku for classification (cheap, fast)
   - The current classifier returns JSON manually parsed as `receipt` or
     `payment`; other values use the document fallback

4. **Routes based on classification:**
   - **Receipt:** Claude Sonnet parses line items → emit `receipt.parsed` event
   - **Payment:** Emit `payment.detected` with extracted text → Telegram bot
     prompts the user and derives the purchase details
   - **Document:** Emit `doc.pdf.parse.completed` with extracted text

5. **Publishes completion events:**
   - `doc.pdf.parse.completed` for document/fallback processing
   - `job.failed` (with error details)

`image.classify.completed`, `job.processing.started`, and
`doc.chunks.embed.requested` are not part of the current contract. They were
removed rather than left as bindings with no producer or consumer.

## Consequences

### Positive

- **Decoupled architecture:** Python Worker doesn't know about NestJS internals, only event contracts
- **Horizontal scaling:** Deploy multiple Python Worker instances; RabbitMQ distributes load
- **Language-appropriate tools:** Python ecosystem for OCR (Tesseract) and document processing
- **Resilient:** Failed jobs can be retried via RabbitMQ; dead letter queue for permanent failures
- **Extensible:** New consumers can subscribe to events without changing Python Worker

### Negative

- **Eventual consistency:** Receipt data isn't immediately queryable after upload
- **Distributed debugging:** Tracing failures across NestJS → RabbitMQ → Python Worker → back to NestJS requires correlation IDs
- **Operational complexity:** Two services to deploy, monitor, and maintain instead of one monolith

### Neutral

- **Object storage required:** The API writes originals to S3-compatible object
  storage and the worker downloads the `storageKey` to ephemeral local storage.
  This removes the shared-filesystem requirement and permits independent scaling.

## Alternatives Considered

### Alternative 1: Process files synchronously in NestJS
**Rejected because:** OCR and LLM calls can take 30+ seconds. Blocking HTTP requests that long causes timeouts and poor UX.

### Alternative 2: Call NestJS APIs instead of events
**Rejected because:** Tight coupling between services. Python Worker would need to know about `/receipts`, `/vector-store` endpoints. Events provide better decoupling and allow multiple consumers.

### Alternative 3: Use AWS Textract instead of Tesseract
**Deferred:** Start with free Tesseract. If accuracy becomes a problem, swap to Textract using strategy pattern. LLM structured parsing will catch most OCR errors anyway.
