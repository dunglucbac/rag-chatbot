# PRD: Event-Driven File Processing Service

## Problem Statement

Users upload receipts, payment screenshots, and knowledge documents via Telegram, but the system cannot automatically extract spending data or enrich the knowledge base. Files sit in storage without being processed, forcing users to manually enter expense information or wait for manual document review.

The existing NestJS monolith creates ingestion jobs but has no mechanism to:
- Extract text from PDFs and images
- Classify file types (receipt vs payment vs document)
- Parse line items from receipts
- Chunk and embed documents for RAG
- Handle ambiguous cases with user confirmation

## Solution

Build a separate Processing Service in Python that consumes file processing events from RabbitMQ, extracts and classifies content using OCR and LLMs, and publishes structured results back to the system. The service will:

- Automatically extract text from uploaded files using appropriate strategies (direct text extraction for PDFs, OCR for images)
- Classify files as receipts, payments, or knowledge documents using LLM
- Parse receipts into structured line items for spending analytics
- Chunk documents and prepare them for vector embedding
- Route ambiguous cases to users via Telegram for confirmation
- Publish results as events for downstream consumers

This enables automatic spending tracking from receipts, user-assisted expense entry from payment screenshots, and continuous knowledge base enrichment from uploaded documents.

## User Stories

1. As a user, I want to upload a receipt photo via Telegram, so that my spending is automatically tracked without manual entry
2. As a user, I want the system to extract merchant name, date, total, and line items from my receipts, so that I can analyze spending patterns
3. As a user, I want to upload a payment screenshot, so that the system can help me record what I purchased
4. As a user, I want to be prompted via Telegram to describe what I bought with a payment, so that I can provide context when needed
5. As a user, I want to skip payment confirmation prompts, so that I'm not forced to respond if I don't care about tracking that expense
6. As a user, I want to upload financial strategy books as PDFs, so that the chatbot can answer questions using that knowledge
7. As a user, I want the system to handle both text-based and scanned PDFs, so that I don't need to worry about file format
8. As a user, I want duplicate receipts to be detected, so that I don't accidentally track the same expense twice
9. As a user, I want to confirm parsed receipt details when the system is uncertain, so that I can correct errors before they're saved
10. As a user, I want receipts to be auto-approved after 24 hours if I don't respond, so that I'm not blocked by confirmation prompts
11. As a developer, I want the Processing Service to be horizontally scalable, so that we can handle increased upload volume
12. As a developer, I want file processing to be asynchronous, so that upload requests don't timeout waiting for OCR/LLM calls
13. As a developer, I want processing failures to be retryable, so that transient errors don't lose user data
14. As a developer, I want event-driven architecture, so that new consumers can subscribe to processing results without modifying the Processing Service
15. As a system, I want to use Tesseract OCR for cost savings, so that we minimize API costs while maintaining acceptable accuracy
16. As a system, I want to use Claude Haiku for classification, so that we get fast, cheap decisions
17. As a system, I want to use Claude Sonnet for line-item parsing, so that we get accurate structured extraction
18. As a system, I want to deduplicate receipts by checksum and key fields, so that re-uploading the same file doesn't create duplicate records
19. As a user, I want multi-page documents to be chunked intelligently, so that the chatbot can cite specific pages when answering questions
20. As a user, I want document chunks to preserve metadata like page numbers and chapter titles, so that citations are meaningful

## Implementation Decisions

### Architecture

- **Separate Python service** for file processing, deployed as containerized workers consuming from RabbitMQ
- **Event-driven communication** between NestJS and Processing Service via RabbitMQ events
- **Strategy pattern** for extraction (PDFExtractor, OCRExtractor) and classification routing
- **Shared filesystem** for file access initially (volume mount), with planned migration to S3 for production

### Processing Service Modules

1. **EventConsumer**: RabbitMQ connection management, consumes `doc.pdf.parse.requested` and `image.classify.requested` events
2. **ExtractionStrategy**: Abstract interface with two implementations:
   - `PDFExtractor`: Uses PyPDF2/pdfplumber for text-based PDFs
   - `OCRExtractor`: Uses Tesseract for images and scanned PDFs
   - Detection logic: attempt text extraction; if < 50 chars, fall back to OCR
3. **ClassificationService**: LLM integration using Claude Haiku with structured output to classify as receipt/payment/document
4. **ReceiptParser**: LLM integration using Claude Sonnet with structured output to extract merchant, date, total, tax, currency, and line items (name, quantity, unitPrice, totalPrice)
5. **DocumentChunker**: Splits text into 1000-character chunks with 200-character overlap, preserves metadata (source, page, chapter, type)
6. **EventPublisher**: Publishes results to RabbitMQ (`receipt.parsed`, `payment.detected`, `doc.chunks.embed.requested`, completion events)

### NestJS Modules to Create/Modify

7. **ReceiptModule** (new): 
   - Consumes `receipt.parsed` events
   - Saves receipts and line items to PostgreSQL with composite unique constraint on `(userId, merchant, purchasedAt, total, checksumSha256)`
   - Handles duplicate detection and returns appropriate errors
8. **VectorStoreModule** (modify):
   - Consumes `doc.chunks.embed.requested` events (batches of up to 100 chunks)
   - Generates embeddings using OpenAI text-embedding-3-small
   - Stores in pgvector with metadata
9. **TelegramModule** (modify):
   - Consumes `payment.detected` events
   - Sends immediate prompt: "What did you buy with this $X payment?"
   - Parses user response into line items
   - Emits `receipt.parsed` event with user-provided details
   - Auto-skips after 24 hours if no response
10. **IngestionModule** (modify):
   - Consumes completion events (`doc.pdf.parse.completed`, `image.classify.completed`, `job.failed`)
   - Updates ingestion job status and metadata

### Event Schemas

**`receipt.parsed` event:**
```json
{
  "jobId": "uuid",
  "userId": "telegram-123",
  "receipt": {
    "merchant": "Starbucks",
    "purchasedAt": "2026-05-05T10:30:00Z",
    "total": 12.50,
    "tax": 1.15,
    "currency": "USD"
  },
  "lineItems": [
    {"name": "Latte", "quantity": 1, "unitPrice": 4.50, "totalPrice": 4.50}
  ]
}
```

**`payment.detected` event:**
```json
{
  "jobId": "uuid",
  "userId": "telegram-123",
  "payment": {
    "amount": 50.00,
    "date": "2026-05-05T14:20:00Z",
    "recipient": "ABC Store"
  }
}
```

**`doc.chunks.embed.requested` event:**
```json
{
  "jobId": "uuid",
  "userId": "telegram-123",
  "chunks": [
    {
      "content": "Investment basics chapter text...",
      "metadata": {"source": "finance.pdf", "page": 42, "chapter": "Ch 3"}
    }
  ]
}
```

### Database Schema Changes

**New tables:**

`receipts`:
- id (uuid, PK)
- userId (varchar)
- merchant (text)
- purchasedAt (timestamp)
- total (numeric)
- tax (numeric, nullable)
- currency (varchar)
- source (varchar)
- rawText (text, nullable)
- checksumSha256 (text)
- createdAt (timestamp)
- updatedAt (timestamp)
- UNIQUE constraint on (userId, merchant, purchasedAt, total, checksumSha256)

`receipt_items`:
- id (uuid, PK)
- receiptId (uuid, FK to receipts)
- name (text)
- quantity (numeric, nullable)
- unitPrice (numeric, nullable)
- totalPrice (numeric)
- category (text, nullable)
- createdAt (timestamp)

### Error Handling

- **Transient failures** (LLM timeout, network errors): Retry with exponential backoff (3 attempts)
- **Permanent failures** (corrupted file, unsupported format): Move to dead letter queue, update job status to `failed` with error message
- **Low confidence classification** (< 0.7): Update job status to `needs_review`, emit event for Telegram bot to prompt user

### Human-in-the-Loop via Telegram

**For payments:**
- Immediate prompt when `payment.detected` event received
- User provides item descriptions in free text format
- Bot parses response and emits `receipt.parsed` event
- Auto-skip after 24 hours if no response

**For low-confidence receipts:**
- Bot sends parsed receipt with inline keyboard: [✅ Looks good] [✏️ Edit] [❌ Reject]
- User confirms, edits, or rejects
- Auto-approve after 24 hours if no response

## Testing Decisions

### What Makes a Good Test

- Test external behavior, not implementation details
- Use real file fixtures (sample PDFs, images) for integration tests
- Mock LLM responses for unit tests to avoid API costs and flakiness
- Test error paths (corrupted files, LLM failures, network errors)
- Verify event payloads match schema contracts

### Modules to Test

1. **ReceiptParser** (unit + integration):
   - Unit: Mock LLM responses, verify structured output parsing
   - Integration: Real receipt text → verify line items extracted correctly
   - Prior art: None yet, establish pattern for LLM-based parsing tests

2. **DocumentChunker** (unit):
   - Test chunk size and overlap logic
   - Verify metadata preservation (page numbers, chapter titles)
   - Test edge cases (documents shorter than chunk size, empty documents)
   - Prior art: None yet, establish pattern for chunking tests

3. **ReceiptModule** (integration):
   - Test receipt and line item persistence
   - Verify duplicate detection via composite unique constraint
   - Test transaction rollback on partial failures
   - Prior art: Similar to existing repository tests in `src/repositories/`

### Testing Strategy

- Processing Service: pytest with fixtures for sample files
- NestJS modules: Jest with TypeORM in-memory database for repository tests
- Event contracts: JSON schema validation tests to catch breaking changes

## Out of Scope

- Multi-page receipt handling (treat each page as separate receipt initially)
- Advanced OCR (AWS Textract, Google Cloud Vision) - start with Tesseract
- LLM rate limit handling with exponential backoff (add if needed)
- S3 file storage (start with local filesystem)
- Multi-language receipt support (English only initially)
- Receipt editing UI (Telegram-only for MVP)
- Analytics dashboard for spending trends
- Automatic categorization of line items beyond what LLM provides
- Receipt photo quality validation (blur detection, orientation correction)

## Further Notes

- The Processing Service should read the same LLM provider config as NestJS to stay consistent, but can choose different model tiers per task (Haiku for classification, Sonnet for parsing)
- Correlation IDs from ingestion jobs should flow through all events for distributed tracing
- The `needs_review` status creates a human-in-the-loop workflow that can be expanded later (e.g., batch review UI, confidence thresholds per user)
- Document chunking strategy (1000 chars, 200 overlap) is a starting point and should be tuned based on RAG retrieval quality
- Payment workflow assumes 1 item by default unless user specifies multiple items
- The event-driven architecture allows future consumers (notifications, audit logs, analytics) without changing the Processing Service
