# ADR 0002: Docling for Document Extraction

**Status:** Accepted  
**Date:** 2026-09-13  
**Deciders:** Thomas

## Context

ADR-0001 selected separate PDF text and Tesseract OCR paths with a
text-length heuristic. The Python Worker now needs one extraction path that
preserves PDF layout and tables, handles scanned PDFs and images, and reports
partial page failures.

## Decision

The Python Worker will use Docling as its single document extraction adapter.

- PDFs use `PDF_AWARE_LAYOUT_REGIONS` so embedded text remains authoritative
  and OCR runs only where needed.
- Images use full-page RapidOCR with the Torch backend and Vietnamese `vi`
  recognition.
- HEIC and HEIF images are normalized to a temporary JPEG before extraction.
- Only Docling `SUCCESS` results produce text. Partial conversions fail the
  Ingestion Job with Docling's error details.
- Container builds prefetch Docling and RapidOCR models for offline runtime.

This decision supersedes the extraction strategy in ADR-0001. ADR-0001's
event-driven Python Worker and RabbitMQ decisions remain in effect.

## Consequences

### Positive

- One extraction implementation handles native PDFs, scanned PDFs, and images.
- Native PDF identifiers are not replaced by less accurate OCR text.
- Layout-aware Markdown improves downstream classification and parsing.
- Partial page failures cannot be published as successful completion.

### Negative

- Docling and its models make the worker environment and container image larger.
- Model initialization increases the latency of the first conversion.
- RapidOCR selects one recognition language per conversion; the current default
  is Vietnamese.
