# Python Worker

File processing worker for receipt intelligence. Consumes ingestion jobs from RabbitMQ, extracts text from PDFs and images (with OCR fallback), classifies documents, parses receipts, chunks documents, and publishes results back to the event bus.

## Prerequisites

- Python 3.11+
- [Poetry](https://python-poetry.org/) for dependency management
- Tesseract OCR engine (system binary required by the `pytesseract` Python package)

```bash
brew install tesseract
```

## Setup

```bash
poetry install
```

## Run

Set the required environment variables and start the worker:

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
│   │   ├── pdf_extractor.py       # PDF text extraction via PyPDF2
│   │   └── ocr_extractor.py       # Image text extraction via Tesseract OCR
│   ├── publisher/
│   │   └── event_publisher.py     # RabbitMQ event publisher
│   └── services/
│       ├── classification_service.py  # LLM-based document classification
│       ├── receipt_parser.py          # LLM-based receipt parsing
│       └── chunking_service.py        # Text chunking for embedding
├── tests/
│   ├── test_pdf_extractor.py
│   ├── test_ocr_extractor.py
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
2. On message arrival, selects the appropriate extractor based on `fileType`
3. PDFs are checked with `needs_ocr` — if text is too short, falls back to OCR
4. Text is classified as `receipt` / `payment` / `document`
5. Receipts are parsed into structured data, documents are chunked for embedding
6. Results are published to the appropriate topic routing key
