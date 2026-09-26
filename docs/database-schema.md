# Database schema

The schema below reflects the current TypeORM entities and database migrations.

## Table inventory

| Table | Purpose | Primary key | Database relationship |
|---|---|---|---|
| `ingestion_jobs` | Tracks uploaded PDF and image processing jobs. | `id` | Application-linked, one-to-zero-or-one `receipts` row through `receipts.ingestion_job_id`. |
| `receipts` | Normalized receipt header and financial totals. | `id` | One-to-many `receipt_items`; optionally linked to one ingestion job. |
| `receipt_items` | Parsed line items and their categorization result. | `id` | Many-to-one `receipts` through `receipt_id`. |
| `chat_sessions` | Durable session ownership and lifecycle metadata. | `id` | No declared foreign keys. Its ID is also used as the LangGraph thread identifier. |
| `web_search_logs` | Tavily search results awaiting or completing scraping. | `id` | No declared foreign keys. |
| `messages` | Legacy persisted messages from the initial schema. | `id` | No declared foreign keys or current TypeORM entity. |

```mermaid
erDiagram
    INGESTION_JOBS {
        uuid id PK
        varchar file_id
        varchar user_id
        varchar original_filename
        varchar storage_path
        varchar mime_type
        enum file_type
        enum classification
        enum status
        text checksum_sha256
        text correlation_id
        text error_message
        jsonb metadata
        text extracted_text
        int chunk_count
        timestamp created_at
        timestamp updated_at
        timestamp completed_at
    }

    RECEIPTS {
        uuid id PK
        varchar user_id
        varchar ingestion_job_id UK
        varchar merchant
        timestamp purchased_at
        numeric total
        numeric tax
        varchar currency
        varchar source
        text raw_text
        varchar checksum_sha256
        timestamp created_at
        timestamp updated_at
    }

    RECEIPT_ITEMS {
        uuid id PK
        uuid receipt_id FK
        varchar name
        numeric quantity
        numeric unit_price
        numeric total_price
        text category
        text subcategory
        varchar categorization_status
        numeric category_confidence
        varchar taxonomy_version
        text classification_metadata
        timestamp created_at
    }

    CHAT_SESSIONS {
        uuid id PK
        varchar user_id
        timestamp created_at
        timestamp updated_at
    }

    WEB_SEARCH_LOGS {
        uuid id PK
        varchar userId
        text query
        text url
        boolean scraped
        timestamp timestamp
    }

    MESSAGES {
        uuid id PK
        varchar userId
        varchar threadId
        text content
        enum role
        varchar toolsUsed
        timestamp createdAt
    }

    RECEIPTS ||--o{ RECEIPT_ITEMS : "receipt_id"
    INGESTION_JOBS o|..o| RECEIPTS : "ingestion_job_id (application link)"
```

## Relationships and constraints

- `receipt_items.receipt_id` has a database foreign key to `receipts.id`.
- `receipts.ingestion_job_id` is nullable and has a partial unique index, allowing at most one receipt for an ingestion job.
- `receipts.ingestion_job_id` does **not** have a database foreign key to `ingestion_jobs.id`; the service maintains this relationship.
- Receipts are additionally unique on `user_id`, `merchant`, `purchased_at`, `total`, and `checksum_sha256`.
- `ingestion_jobs` has a partial unique index on `(user_id, checksum_sha256)` when `checksum_sha256` is present, preventing duplicate uploads by the same user.
- `chat_sessions` has an index on `user_id` for ownership and retention queries.
- `web_search_logs`, `chat_sessions`, and `messages` have no declared foreign-key relationships. `messages` is created by the initial migration but has no current TypeORM entity.
