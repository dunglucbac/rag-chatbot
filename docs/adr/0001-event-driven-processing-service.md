# ADR 0001: Event-Driven Processing Service for File Ingestion

**Status:** Accepted  
**Date:** 2026-05-05  
**Deciders:** Thomas

## Context

Users upload receipts, payment screenshots, and knowledge documents via Telegram. These files need to be:
- Classified (receipt vs payment vs document)
- Extracted (OCR or text extraction)
- Parsed (line items for receipts, metadata for documents)
- Stored (relational data for receipts, embeddings for documents)

The existing NestJS monolith handles uploads and creates ingestion jobs, but doesn't process the files.

## Decision

We will build a separate **Processing Service** in Python that:

1. **Consumes events from RabbitMQ:**
   - `doc.pdf.parse.requested`
   - `image.classify.requested`

2. **Extracts text using a two-path strategy:**
   - Text-based PDFs → PyPDF2/pdfplumber (free, fast)
   - Image-based PDFs and images → Tesseract OCR (free, decent accuracy)
   - Detection: attempt text extraction; if < 50 chars, fall back to OCR

3. **Classifies using LLM:**
   - Claude Haiku for classification (cheap, fast)
   - Structured output: receipt, payment, or document

4. **Routes based on classification:**
   - **Receipt:** Claude Sonnet parses line items → emit `receipt.parsed` event
   - **Payment:** Extract amount/date → emit `payment.detected` event → Telegram bot prompts user
   - **Document:** Chunk text (1000 chars, 200 overlap) → emit `doc.chunks.embed.requested` event

5. **Publishes completion events:**
   - `doc.pdf.parse.completed`
   - `image.classify.completed`
   - `job.failed` (with error details)

## Consequences

### Positive

- **Decoupled architecture:** Processing Service doesn't know about NestJS internals, only event contracts
- **Horizontal scaling:** Deploy multiple Processing Service instances; RabbitMQ distributes load
- **Language-appropriate tools:** Python ecosystem for OCR (Tesseract) and document processing
- **Resilient:** Failed jobs can be retried via RabbitMQ; dead letter queue for permanent failures
- **Extensible:** New consumers can subscribe to events without changing Processing Service

### Negative

- **Eventual consistency:** Receipt data isn't immediately queryable after upload
- **Distributed debugging:** Tracing failures across NestJS → RabbitMQ → Processing Service → back to NestJS requires correlation IDs
- **Operational complexity:** Two services to deploy, monitor, and maintain instead of one monolith

### Neutral

- **Shared filesystem required (initially):** Processing Service reads files from `storage/uploads/` via volume mount. Migration to S3 planned for production.

## Alternatives Considered

### Alternative 1: Process files synchronously in NestJS
**Rejected because:** OCR and LLM calls can take 30+ seconds. Blocking HTTP requests that long causes timeouts and poor UX.

### Alternative 2: Call NestJS APIs instead of events
**Rejected because:** Tight coupling between services. Processing Service would need to know about `/receipts`, `/vector-store` endpoints. Events provide better decoupling and allow multiple consumers.

### Alternative 3: Use AWS Textract instead of Tesseract
**Deferred:** Start with free Tesseract. If accuracy becomes a problem, swap to Textract using strategy pattern. LLM structured parsing will catch most OCR errors anyway.

