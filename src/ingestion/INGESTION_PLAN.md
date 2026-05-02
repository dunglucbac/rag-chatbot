# Ingestion PRD: Async Upload, Job Tracking, and Event Contract

## Problem Statement

The ingestion service needs to accept user-uploaded files quickly while deferring expensive parsing, OCR, classification, chunking, and persistence work to asynchronous workers. The current implementation has the beginnings of RabbitMQ bindings and an `ingestion_jobs` table, but the event names and message payloads are not yet aligned with the desired workflow contract.

The next implementation slice should make ingestion reliable enough to support future PDF parsing, image classification, receipt extraction, payment screenshot review, and Telegram/webhook uploads without forcing a redesign of the API or queue contract.

## Solution

Build the first stable ingestion slice around asynchronous upload acceptance and job orchestration.

The API will:

- Accept PDF and image uploads.
- Store each uploaded file persistently.
- Generate an immutable `file_id` for every new uploaded file.
- Create an `ingestion_job` record tied to a strict `user_id`, `file_id`, `file_type`, and `classification`.
- Compute and store a SHA-256 checksum for the uploaded file.
- Publish a direct requested-work event to RabbitMQ.
- Return a standardized response containing the accepted job, not the full broker message.
- Expose a standardized job-status endpoint.

Workers will be added later. The first slice should define event contracts so Python workers can consume requested-work events and eventually publish status/result events back to NestJS. NestJS should own database status updates; workers should not write directly to Postgres.

## User Stories

1. As an API client, I want to upload a PDF and receive a job id immediately, so that the request remains fast while parsing happens asynchronously.
2. As an API client, I want to upload an image and receive a job id immediately, so that OCR and classification can happen asynchronously.
3. As an API client, I want the upload response to follow the shared API response shape, so that client handling is consistent.
4. As an API client, I want the upload response to include the job and accepted state, so that I know the file was queued for ingestion.
5. As an API client, I do not want to receive internal broker payloads in the upload response, so that the public API stays stable and implementation details remain hidden.
6. As an API client, I want to query an ingestion job by id, so that I can poll for status after upload.
7. As an API client, I want the job-status response to use the same API wrapper as uploads, so that response handling is predictable.
8. As a future authenticated user, I want every job to be tied to a user id, so that ownership can be enforced once authentication is added.
9. As a future Telegram/webhook integration, I want each uploaded file to receive a backend-generated immutable file id, so that webhook-delivered files can be processed consistently.
10. As a future Telegram/webhook integration, I want optional source context to travel with the job and event, so that platform-specific metadata can be attached without changing the core ingestion contract.
11. As a backend operator, I want unsupported file types rejected before a job is created, so that invalid work does not enter the queue.
12. As a backend operator, I want each uploaded file to have a checksum, so that duplicate detection and file verification can be added later.
13. As a backend operator, I want the job to remain `pending` until a worker starts processing, so that status reflects the real lifecycle.
14. As a backend operator, I want publish failures to mark the job as `failed`, so that jobs do not silently disappear when RabbitMQ is unavailable.
15. As a backend operator, I want upload success to require successful broker publication, so that `accepted: true` means worker processing has actually been requested.
16. As a Python worker author, I want stable requested-work event names, so that each worker has a clear responsibility.
17. As a Python worker author, I want `routingKey` and message-body `event_type` to match, so that messages can be replayed, inspected, and validated safely.
18. As a Python worker author, I want every message to include a schema version, so that workers can evolve safely as the ingestion contract changes.
19. As a Python worker author, I want domain identifiers such as `job_id`, `file_id`, and `user_id` in the event payload, so that message metadata remains separate from application data.
20. As a system maintainer, I want NestJS to own database status updates, so that workers do not need direct Postgres access.
21. As a system maintainer, I want future worker result/status events defined early, so that the requested-work contract has a clear path to completion handling.
22. As a developer, I want the current `source_type` concept split into `file_type` and `classification`, so that file containers and document meaning are not conflated.
23. As a developer, I want images and PDFs routed to direct requested-work events, so that the first worker step is explicit.
24. As a developer, I want correlation ids generated or propagated, so that all events for an upload can be traced together.
25. As a developer, I want invalid supplied correlation ids normalized by generating a new id, so that tracing stays safe without rejecting otherwise valid uploads.

## Implementation Decisions

### Scope of this slice

This slice covers asynchronous upload acceptance, persistent job tracking, standardized API responses, and a stable RabbitMQ event contract. It does not implement PDF parsing, OCR, image classification, receipt persistence, payment review, or worker result consumers yet.

### File acceptance

The upload API should accept:

- PDFs identified by MIME type or `.pdf` extension.
- Images identified by image MIME type or supported extensions such as `.png`, `.jpg`, `.jpeg`, `.webp`, `.tif`, and `.tiff`.

Unsupported file types should be rejected synchronously with a normal NestJS bad-request error. No job should be created and no event should be published for unsupported uploads.

### File identity

Every uploaded file should receive a backend-generated immutable `file_id`.

For the first implementation, Multer should generate a UUID-based filename and the service may derive the `file_id` from the saved filename. The system should not allow callers to supply or replace `file_id` values. If replacement or deduplication is needed later, it should be modeled separately with checksums, source metadata, or explicit supersession fields.

### User identity

`user_id` should be required in the service contract, job record, and event payload. The controller should pass `user_id` into the ingestion service. Until authentication is added, the controller may use a temporary source for `user_id`; later this should be replaced with the authenticated request user without changing the service contract.

### Job schema

The ingestion job model should support:

- `id`
- `user_id`
- `file_id`
- `original_filename`
- `storage_path`
- `mime_type`
- `file_type`
- `classification`
- `status`
- `checksum_sha256`
- `correlation_id`
- `error_message`
- `metadata`
- `extracted_text`
- `chunk_count`
- `created_at`
- `updated_at`
- `completed_at`

`source_type` should be replaced or evolved into two separate concepts:

- `file_type`: `pdf` or `image`
- `classification`: `receipt`, `payment`, `document`, or `unknown`

At upload time, `classification` should default to `unknown`.

### Job statuses

Use five user-facing domain statuses:

- `pending`: upload accepted and requested-work event published; no worker has started yet.
- `processing`: a worker has started processing the job.
- `needs_review`: the job requires user input or manual review.
- `completed`: ingestion completed successfully.
- `failed`: ingestion failed terminally.

Operational states such as retrying, dead-lettered, queued, and cancelled are out of scope for the first slice.

### Checksum

The service should compute a SHA-256 checksum after the file is saved and before publishing the event. Store it as `checksum_sha256` and include it in the event payload. The first slice should not reject duplicates; checksum-based deduplication can be added later.

### Source context

The ingestion contract should support optional `source_context` metadata. This should be generic JSON rather than Telegram-specific fields.

Examples of future source context include:

- source platform
- external file id
- chat or conversation id
- message id
- webhook update id

For the current upload endpoint, `source_context` may be absent or null.

### Correlation id

The upload endpoint should support an optional `x-correlation-id` header. If present, the backend should trim and validate it with a conservative maximum length and safe-character policy. If it is absent or invalid, the backend should generate a new UUID instead of rejecting the upload.

The selected correlation id should be stored on the job and included in the event envelope.

### Queue topology and event names

Use RabbitMQ with the existing topic exchange concept. The first slice should publish direct requested-work events rather than generic uploaded events.

Requested-work events:

- `doc.pdf.parse.requested`
- `image.classify.requested`

Future status/result events should be defined in the contract, but consumers do not need to be implemented in this slice:

- `job.processing.started`
- `doc.pdf.parse.completed`
- `image.classify.completed`
- `job.failed`

PDF uploads should publish `doc.pdf.parse.requested`.

Image uploads should publish `image.classify.requested`.

### Event envelope

Every ingestion event should use a strict versioned envelope. The RabbitMQ routing key must match the envelope `event_type`.

Envelope metadata should include:

- `schema_version`
- `event_id`
- `event_type`
- `correlation_id`
- `attempt`
- `created_at`
- `payload`

Domain data belongs in `payload`, including:

- `job_id`
- `file_id`
- `user_id`
- `file_type`
- `classification`
- `original_filename`
- `storage_path`
- `mime_type`
- `file_extension`
- `file_size`
- `checksum_sha256`
- `source_context`

`schema_version` should start at `1`.

### Publish behavior

The direct create-then-publish approach is acceptable for this slice.

The service should:

1. Create the job as `pending`.
2. Publish the requested-work event.
3. Return success only if publishing succeeds.
4. If publishing fails, mark the job as `failed` with an error message and return an error to the caller.

A transactional outbox is intentionally deferred. The event envelope should be designed so an outbox publisher can publish the same message shape later.

### Worker status model

Future Python workers should not write directly to Postgres. They should publish status/result events back to RabbitMQ, and NestJS should consume those events and update job status.

For this slice, define the contract and leave consumers for a later implementation phase.

### API responses

Keep `ApiResponse<TData>` as the standard wrapper.

The upload endpoint should return a dedicated upload-accepted response containing:

- `job`
- `accepted: true`

The upload response should not return the full broker event envelope.

The job-status endpoint should return a separate standardized job response.

Both responses should use the shared API response wrapper.

## Testing Decisions

Tests should focus on externally visible behavior rather than implementation details.

Good tests for this slice should verify:

- A supported PDF upload creates a pending job and publishes `doc.pdf.parse.requested`.
- A supported image upload creates a pending job and publishes `image.classify.requested`.
- The published routing key matches the envelope `event_type`.
- The event envelope includes `schema_version`, `event_id`, `correlation_id`, `attempt`, `created_at`, and a payload with `job_id`, `file_id`, `user_id`, file metadata, checksum, and classification.
- Unsupported uploads are rejected and do not create jobs or publish events.
- Upload success does not expose the full event payload.
- Upload response uses the standardized API wrapper and includes `accepted: true`.
- Job-status response uses the standardized API wrapper.
- Invalid `x-correlation-id` values result in generated correlation ids rather than rejected uploads.
- Publish failure marks the job as `failed` and causes the upload endpoint to return an error.

Modules worth testing in isolation:

- File type detection.
- Correlation id normalization.
- Event envelope construction.
- Upload orchestration in the ingestion service.

Integration tests should cover the controller/service boundary and verify standardized response shapes.

## Out of Scope

The following are out of scope for this slice:

- Authentication and ownership enforcement.
- Telegram webhook implementation.
- Uploaded files table.
- File replacement or caller-supplied file ids.
- Checksum-based deduplication.
- Transactional outbox publishing.
- PDF parsing implementation.
- OCR implementation.
- Image classification implementation.
- Receipt extraction and persistence.
- Payment screenshot review flow.
- Worker result/status event consumers.
- Retry queues, dead-letter queues, and monitoring dashboards.
- Vector database chunking and embedding changes.

## Further Notes

This design intentionally keeps the first implementation slice small while making the contract strict enough for future workers and webhook ingestion. The most important architectural decisions are:

- `file_id` is immutable and backend-generated.
- `user_id` is required in the service, database, and event payload even before authentication is fully implemented.
- `job_id`, `file_id`, and `user_id` are domain payload data, not envelope metadata.
- `event_type` is duplicated in the message body and RabbitMQ routing key intentionally.
- `file_type` and `classification` are separate fields.
- Upload success means the requested-work event was published successfully.
- NestJS remains the owner of job status updates; Python workers communicate results through events.

## Suggested Implementation Phases

### Phase 1: Async upload and event contract

- Add strict event constants and envelope types.
- Update queue bindings to requested-work routing keys.
- Add `file_id`, `user_id`, `file_type`, `classification`, `checksum_sha256`, and `correlation_id` to jobs.
- Generate UUID filenames and derive immutable `file_id`.
- Compute checksums.
- Publish direct requested-work events.
- Standardize upload and job-status responses.

### Phase 2: Worker result/status events

- Add NestJS consumers for worker status/result events.
- Enforce valid job status transitions.
- Handle worker failures through `job.failed`.

### Phase 3: PDF parsing and OCR

- Add Python PDF parser worker.
- Extract direct text first.
- Fall back to OCR for scanned PDFs.
- Store normalized content and metadata.

### Phase 4: Image classification and receipt/payment workflows

- Add image classifier worker.
- Route receipts to receipt persistence.
- Route payment screenshots or low-confidence results to review.

### Phase 5: Reliability and operations

- Add transactional outbox.
- Add retry and dead-letter handling.
- Add monitoring and operational dashboards.
- Add checksum-based deduplication if needed.
