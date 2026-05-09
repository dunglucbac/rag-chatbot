from enum import StrEnum


class EventType(StrEnum):
    # Incoming
    DOC_PDF_PARSE_REQUESTED = "doc.pdf.parse.requested"
    IMAGE_CLASSIFY_REQUESTED = "image.classify.requested"

    # Outgoing
    DOC_PDF_PARSE_COMPLETED = "doc.pdf.parse.completed"
    JOB_FAILED = "job.failed"
    JOB_PROCESSING_STARTED = "job.processing.started"

    # Classification outcomes
    RECEIPT_PARSED = "receipt.parsed"
    RECEIPT_NEEDS_REVIEW = "receipt.needs_review"
    PAYMENT_DETECTED = "payment.detected"
    DOC_CHUNKS_EMBED_REQUESTED = "doc.chunks.embed.requested"
