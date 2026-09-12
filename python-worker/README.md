# Python Worker

File processing worker for receipt intelligence. Consumes ingestion jobs from RabbitMQ, extracts layout-aware text from PDFs and images with Docling, classifies documents, parses receipts, chunks documents, and publishes results back to the event bus.

## Prerequisites

- Python 3.11–3.13
- [Poetry](https://python-poetry.org/) for dependency management

## Setup

```bash
poetry install
```

## Run

```bash
poetry run python main.py
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | `amqp://localhost` | RabbitMQ connection URL |
| `RABBITMQ_EXCHANGE` | `ingest.topic` | Topic exchange name |
| `RABBITMQ_PDF_QUEUE` | `ingest.pdf.queue` | Queue for PDF parse requests |
| `RABBITMQ_IMAGE_QUEUE` | `ingest.image.queue` | Queue for image classify requests |
| `RABBITMQ_PREFETCH_COUNT` | `10` | Max unacked messages per worker |
| `DOCLING_ARTIFACTS_PATH` | — | Optional path to pre-fetched Docling layout/table/RapidOCR models |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for LLM classification and parsing (optional; skips LLM services if unset) |

## Tests

```bash
poetry run pytest -v
```

## Project structure

```
python-worker/
├── main.py                        # Worker entry point (RabbitMQ connection, pipeline wiring)
├── src/
│   ├── consumer/
│   │   └── event_consumer.py      # Message handler: extract → classify → parse → publish
│   ├── extractors/
│   │   ├── base_extractor.py      # Abstract base class (extract + needs_ocr)
│   │   ├── docling_extractor.py   # PDF/image extraction via Docling
│   ├── publisher/
│   │   └── event_publisher.py     # RabbitMQ event publisher
│   └── services/
│       ├── classification_service.py  # LLM-based document classification
│       ├── receipt_parser.py          # LLM-based receipt parsing
│       └── chunking_service.py        # Text chunking for embedding
├── tests/
│   ├── test_docling_extractor.py
│   ├── test_extractor_adapter.py
│   ├── test_event_consumer.py
│   ├── test_event_contracts.py
│   ├── test_classification_service.py
│   ├── test_receipt_parser.py
│   └── test_chunking_service.py
├── pyproject.toml                 # Poetry config
├── poetry.lock                    # Locked dependencies
└── Dockerfile                     # Production container
```

## Processing flow

1. Worker listens on `ingest.pdf.queue` and `ingest.image.queue`
2. On message arrival, routes PDFs and images through the Docling extractor
3. Docling extracts direct PDF text or performs OCR for scanned PDFs/images, while preserving document layout and tables
4. Text is classified as `receipt` / `payment` / `document`
5. Receipts are parsed into structured data, documents are chunked for embedding
6. Results are published to the appropriate topic routing key

Docling uses its bundled RapidOCR Torch backend with the Vietnamese `vi` recognizer, so no system OCR package is required. It downloads document-layout, table, and OCR models on first conversion. For an offline deployment, pre-fetch them and set `DOCLING_ARTIFACTS_PATH`:

```bash
poetry run docling-tools models download --output-dir ./docling-models \
  layout tableformer rapidocr --rapidocr-backend-lang torch:vi
DOCLING_ARTIFACTS_PATH="$PWD/docling-models" poetry run python main.py
```
