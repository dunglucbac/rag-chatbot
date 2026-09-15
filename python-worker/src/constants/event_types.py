from enum import StrEnum


class EventType(StrEnum):
    # Incoming
    DOC_PDF_PARSE_REQUESTED = "doc.pdf.parse.requested"
    IMAGE_CLASSIFY_REQUESTED = "image.classify.requested"

    # Outgoing
    DOC_PDF_PARSE_COMPLETED = "doc.pdf.parse.completed"
    JOB_FAILED = "job.failed"
    JOB_PROCESSING_STARTED = "job.processing.started"

    # Receipt outcomes: structured receipt data is ready, or needs review.
    RECEIPT_PARSED = "receipt.parsed"
    RECEIPT_NEEDS_REVIEW = "receipt.needs_review"

    # Payment outcome: a transfer/payment confirmation was detected. It has no
    # itemized purchase details yet, so the app follows up with the user.
    PAYMENT_DETECTED = "payment.detected"


class ClassificationType(StrEnum):
    RECEIPT = "receipt"
    PAYMENT = "payment"
    UNKNOWN = "unknown"
