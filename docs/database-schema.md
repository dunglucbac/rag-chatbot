# Database schema

The schema below reflects the current TypeORM entities and database migrations.

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
        timestamp created_at
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
- `web_search_logs` and `messages` have no declared relationships. `messages` is created by the initial migration but has no current TypeORM entity.
