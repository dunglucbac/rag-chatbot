# ADR 0003: DeepDoc + VietOCR for Document Extraction

**Status:** Accepted  
**Date:** 2026-09-17  
**Deciders:** Thomas

## Context

The Python Worker needs one extraction path for Receipt, Payment, and Document
Ingestion Jobs. The previous Docling adapter was removed in favour of the
DeepDoc + VietOCR implementation, which bundles Vietnamese OCR, layout models,
and table-structure models.

The extraction implementation must not leak model lifecycle or file-format
handling into the Ingestion Job processor.

## Decision

The worker uses `DocumentExtractor` as its extraction seam.

- `DeepDocVietOcrExtractor` is the production adapter at that seam.
- The adapter owns one reusable `DeepDocPipeline`; the pipeline initializes its
  OCR and layout models once and reuses them for later Ingestion Jobs.
- PDFs are rasterized page by page. Image files are loaded directly. HEIC/HEIF
  normalization remains owned by the Ingestion Job processor.
- Table regions are rendered as Markdown; non-table text is OCRed and merged
  in reading order.
- Extraction returns Markdown in memory and does not create result files.

This ADR supersedes ADR-0002. ADR-0001's event-driven worker and RabbitMQ
decisions remain in effect.

## Consequences

### Positive

- Ingestion processing depends on a stable extraction interface instead of a
  concrete OCR implementation.
- Model initialization cost is paid once per worker instead of once per job.
- Text and table extraction have one testable implementation with no
  filesystem output side effects.
- Bundled models allow offline extraction after the worker image is built.

### Negative

- The vendored DeepDoc + VietOCR models substantially increase repository and
  container size.
- The first extraction still incurs model initialization latency.
- Maintaining the vendored implementation and model assets is now the
  worker's responsibility.
