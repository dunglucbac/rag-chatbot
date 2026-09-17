# Python Worker

File processing worker for receipt intelligence. Consumes ingestion jobs from RabbitMQ, extracts layout-aware text from PDFs and images with DeepDoc + VietOCR, classifies receipts and payments, parses receipts, and publishes results back to the event bus.

## Prerequisites

- Python 3.11–3.13
- [Poetry](https://python-poetry.org/) for dependency management

## Setup

```bash
poetry install
poetry run pip install --no-deps VietOCR==0.3.13
```

VietOCR is installed without its pinned Pillow dependency because the worker's
HEIC support requires a newer Pillow version.

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
| `DEEPDOC_LAYOUT_THRESHOLD` | `0.5` | Minimum layout-detection confidence used by DeepDoc |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for LLM classification and parsing (optional; skips LLM services if unset) |
| `VISION_FALLBACK_CONFIDENCE_THRESHOLD` | `0.9` | Sends an image to the vision model only when text-only receipt parsing confidence is below this value; set to `0` to disable vision fallback. |

## Test with RabbitMQ

Start the worker, then publish an event to the configured exchange (default
`ingest.topic`) with routing key `image.classify.requested`. The
`storagePath` must be a path that exists inside the worker container or process.

```json
{
  "schemaVersion": 1,
  "eventId": "test-event-001",
  "eventType": "image.classify.requested",
  "correlationId": "test-correlation-001",
  "attempt": 1,
  "createdAt": "2026-09-17T10:00:00Z",
  "payload": {
    "jobId": "test-job-001",
    "fileId": "test-file-001",
    "userId": "test-user-001",
    "originalFilename": "receipt.jpg",
    "storagePath": "/Users/thomas/Downloads/receipts/P0 (3).jpg",
    "mimeType": "image/jpeg",
    "fileType": "image",
    "classification": "unknown",
    "fileExtension": ".jpg",
    "fileSize": 12345,
    "checksumSha256": "test-checksum",
    "correlationId": "test-correlation-001"
  }
}
```

For a PDF, publish the same envelope with routing key
`doc.pdf.parse.requested`, set `fileType` to `pdf`, and provide a PDF
`storagePath`.

## Tests

```bash
poetry run pytest -v
```

## Debug receipt classification

Use the receipt debugger to inspect the source image, extracted Markdown, exact
classifier prompt/response, and OCR-versus-vision receipt parsing:

```bash
poetry run jupyter lab notebooks/debug_receipt_classification.ipynb
```

By default it opens `/Users/thomas/Downloads/receipts/P0 (2).jpg`. Set
`RECEIPT_DEBUG_IMAGE` before starting Jupyter to inspect another local image.
The classification and parsing cells require `ANTHROPIC_API_KEY` and make LLM
requests.

## Project structure

```
python-worker/
├── main.py                        # Worker entry point (RabbitMQ connection, pipeline wiring)
├── src/
│   ├── consumer/
│   │   └── event_consumer.py      # RabbitMQ decode, publish, failure, and ack handling
│   ├── extractors/
│   │   ├── deepdoc_vietocr/       # Vendored DeepDoc + VietOCR pipeline and models
│   │   └── deepdoc_vietocr_extractor.py # PDF/image extraction adapter
│   ├── processing/
│   │   └── ingestion_job_processor.py # Validate and process one ingestion job
│   ├── publisher/
│   │   └── event_publisher.py     # RabbitMQ event publisher
│   └── services/
│       ├── classification_service.py  # LLM-based receipt/payment classification
│       ├── receipt_parser.py          # LLM-based receipt parsing
├── tests/
│   ├── test_deepdoc_vietocr_extractor.py
│   ├── test_event_consumer.py
│   ├── test_ingestion_job_processor.py
│   ├── test_classification_service.py
│   └── test_receipt_parser.py
├── pyproject.toml                 # Poetry config
├── poetry.lock                    # Locked dependencies
└── Dockerfile                     # Production container
```

## Processing flow

### Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    participant Producer as Ingestion service
    participant RabbitMQ as RabbitMQ (ingest.topic)
    participant Worker as Python worker
    participant DeepDoc as DeepDoc + VietOCR
    participant Classifier as Classification LLM
    participant Parser as Receipt parser LLM
    participant Vision as Vision LLM

    Producer->>RabbitMQ: Publish ingestion request
    RabbitMQ->>Worker: Deliver PDF or image job
    Worker->>DeepDoc: Extract text / perform OCR
    DeepDoc-->>Worker: Extracted text
    Worker->>Classifier: Classify extracted text
    Classifier-->>Worker: receipt or payment

    alt Receipt
        Worker->>Parser: Parse OCR-derived receipt text
        Parser-->>Worker: Receipt fields and confidence
        opt Image job and confidence < vision fallback threshold (default 0.9)
            Worker->>Vision: Parse the source image
            Vision-->>Worker: Receipt fields and confidence
            Note over Worker: Keep the vision result only if confidence improves
        end
        alt Final parser confidence < review threshold (0.7)
            Worker->>RabbitMQ: Publish receipt.needs_review
        else Final parser confidence >= review threshold
            Worker->>RabbitMQ: Publish receipt.parsed
        end
    else Payment
        Worker->>RabbitMQ: Publish payment.detected
    else No classifier configured or other result
        Worker->>RabbitMQ: Publish doc.pdf.parse.completed
    end

    Worker->>RabbitMQ: Acknowledge original delivery
```

1. Worker listens on `ingest.pdf.queue` and `ingest.image.queue`
2. Consumer validates the message payload as an ingestion job
3. Processor converts HEIC/HEIF to a temporary JPEG when needed
4. DeepDoc + VietOCR extracts PDF pages or images while preserving layout and tables
5. Processor classifies the text and parses a Receipt or routes a Payment
6. Consumer publishes the resulting event and acknowledges the RabbitMQ delivery

DeepDoc and VietOCR model assets are included in `src/extractors/deepdoc_vietocr`,
so no system OCR package or model-download command is required at runtime.
