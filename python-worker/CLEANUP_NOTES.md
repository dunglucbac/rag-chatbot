# Python Worker Cleanup Notes

## Goal

Make the Python Worker easier to understand and change while preserving the
event-driven processing decision in `docs/adr/0001-event-driven-processing-service.md`.

The deep module will be an **Ingestion Job processor**. Its interface accepts a
validated Ingestion Job and returns one outbound event. Its implementation owns
input normalization, Docling extraction, classification, Receipt parsing,
Payment routing, and Document chunking.

RabbitMQ delivery remains outside that seam: the consumer decodes messages,
publishes the processor's result, reports failures, and acknowledges deliveries.

## Steps

- [x] 1. Add typed `IngestionJob` and `ProcessingResult` values and move the
      classification/routing implementation behind `IngestionJobProcessor.process()`.
- [x] 2. Normalize HEIC/HEIF inputs through a temporary JPEG owned by the
      processor. Preserve the uploaded source and always clean up the temporary file.
- [x] 3. Reduce `EventConsumer` to message decoding, processing, publishing,
      failure reporting, and acknowledgement. Ensure malformed messages enter the
      failure path.
- [x] 4. Remove the shallow `ExtractorAdapter` and `BaseExtractor` modules. Docling
      is the single extraction adapter and already handles native PDF text and OCR.
- [x] 5. Build Docling and LLM-backed processing dependencies once per worker so a
      RabbitMQ reconnect does not recreate them or discard initialized model state.
- [x] 6. Complete type annotations, update documentation, and run the full tests.

## Invariants

- PDF extraction preserves embedded text and OCRs only regions that need it.
- Image extraction uses full-page RapidOCR with the Vietnamese `vi` recognizer.
- Docling `PARTIAL_SUCCESS` is a failed Ingestion Job and must not publish a
  completion event.
- A failed `JOB_FAILED` publication leaves the RabbitMQ delivery unacknowledged for
  redelivery.
- Temporary image conversion never deletes or overwrites the uploaded source.

## Verification

- 25 tests pass through the processor and consumer interfaces.
- A real Docling PDF smoke test preserves `O0I1lL-20260912`.
- Python compilation and `git diff --check` pass.

## Follow-up reliability work

These concerns cross the RabbitMQ or NestJS seam and should be handled as
separate changes:

- Enable publisher confirms before acknowledging an input delivery.
- Keep RabbitMQ I/O active during long Docling and LLM calls, not only between
  processing stages.
- Reconcile the unused `image.classify.completed` event with the actual Receipt,
  Payment, and Document result events.
- Mark Document ingestion jobs complete after vector-store embedding succeeds.
- Make the no-`ANTHROPIC_API_KEY` extraction-only behavior explicit in configuration.
