import pytest
from unittest.mock import Mock, MagicMock
from src.consumer.event_consumer import EventConsumer
from src.constants.event_types import EventType


def _body(payload):
    """Wrap a payload dict in the EventEnvelope format NestJS uses."""
    import json

    return json.dumps({"payload": payload}).encode()


def test_can_process_pdf_parse_requested_event():
    """Can process a doc.pdf.parse.requested event and extract text"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 1
    properties = Mock()

    body = _body(
        {"jobId": "job-123", "storagePath": "/path/to/file.pdf", "fileType": "pdf"}
    )

    extractor = Mock()
    extractor.extract.return_value = "Extracted PDF text content"
    extractor.needs_ocr.return_value = False

    publisher = Mock()

    consumer = EventConsumer(extractor, publisher)
    consumer.on_message(channel, method, properties, body)

    extractor.extract.assert_called_once_with("/path/to/file.pdf")

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.DOC_PDF_PARSE_COMPLETED
    assert "job-123" in str(call_args[1])

    channel.basic_ack.assert_called_once_with(delivery_tag=1)


def test_classifies_and_parses_receipt():
    """Can classify text as receipt and parse into structured data"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 2
    properties = Mock()

    body = _body(
        {"jobId": "job-456", "storagePath": "/path/to/receipt.pdf", "fileType": "pdf"}
    )

    extractor = Mock()
    extractor.extract.return_value = "Starbucks Receipt\nTotal: $12.50"
    extractor.needs_ocr.return_value = False

    classifier = Mock()
    classifier.classify.return_value = {"classification": "receipt", "confidence": 0.95}

    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Starbucks",
        "total": 12.50,
        "lineItems": [{"name": "Latte", "totalPrice": 4.50}],
    }

    publisher = Mock()

    consumer = EventConsumer(extractor, publisher, classifier, parser)
    consumer.on_message(channel, method, properties, body)

    classifier.classify.assert_called_once()
    parser.parse.assert_called_once()

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.RECEIPT_PARSED
    assert "Starbucks" in str(call_args[1])


def test_handles_image_classification_with_ocr():
    """Can process image.classify.requested event using OCR"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 3
    properties = Mock()

    body = _body(
        {"jobId": "job-789", "storagePath": "/path/to/image.jpg", "fileType": "image"}
    )

    ocr_extractor = Mock()
    ocr_extractor.extract.return_value = "Starbucks Receipt\nTotal: $12.50"

    classifier = Mock()
    classifier.classify.return_value = {"classification": "receipt", "confidence": 0.95}

    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Starbucks",
        "total": 12.50,
        "lineItems": [{"name": "Latte", "totalPrice": 4.50}],
    }

    publisher = Mock()

    consumer = EventConsumer(None, publisher, classifier, parser, ocr_extractor)
    consumer.on_message(channel, method, properties, body)

    ocr_extractor.extract.assert_called_once_with("/path/to/image.jpg")
    classifier.classify.assert_called_once()
    parser.parse.assert_called_once()

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.RECEIPT_PARSED


def test_publishes_payment_detected_event():
    """Can classify as payment and publish payment.detected event"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 4
    properties = Mock()

    body = _body(
        {"jobId": "job-999", "storagePath": "/path/to/payment.jpg", "fileType": "image"}
    )

    ocr_extractor = Mock()
    ocr_extractor.extract.return_value = "Bank Transfer\nAmount: $50.00\nTo: ABC Store"

    classifier = Mock()
    classifier.classify.return_value = {"classification": "payment", "confidence": 0.90}

    publisher = Mock()

    consumer = EventConsumer(None, publisher, classifier, None, ocr_extractor)
    consumer.on_message(channel, method, properties, body)

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.PAYMENT_DETECTED
    assert "job-999" in str(call_args[1])


def test_chunks_document_and_publishes_embed_request():
    """Can classify as document, chunk it, and publish doc.chunks.embed.requested"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 5
    properties = Mock()

    body = _body(
        {
            "jobId": "job-doc-1",
            "userId": "user-123",
            "storagePath": "/path/to/doc.pdf",
            "fileType": "pdf",
        }
    )

    extractor = Mock()
    extractor.extract.return_value = "A" * 2000
    extractor.needs_ocr.return_value = False

    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "document",
        "confidence": 0.95,
    }

    chunker = Mock()
    chunker.chunk_with_metadata.return_value = [
        {
            "content": "A" * 1000,
            "metadata": {"source": "/path/to/doc.pdf", "type": "pdf"},
        },
        {
            "content": "A" * 1000,
            "metadata": {"source": "/path/to/doc.pdf", "type": "pdf"},
        },
    ]

    publisher = Mock()

    consumer = EventConsumer(extractor, publisher, classifier, None, None, chunker)
    consumer.on_message(channel, method, properties, body)

    chunker.chunk_with_metadata.assert_called_once()

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.DOC_CHUNKS_EMBED_REQUESTED
    event_data = call_args[1]
    assert event_data["jobId"] == "job-doc-1"
    assert event_data["userId"] == "user-123"
    assert len(event_data["chunks"]) == 2


def test_publishes_job_failed_on_processing_error():
    """Can catch processing errors and publish job.failed event"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 6
    properties = Mock()

    body = _body(
        {"jobId": "job-err-1", "storagePath": "/path/to/bad.pdf", "fileType": "pdf"}
    )

    extractor = Mock()
    extractor.extract.side_effect = Exception("Corrupted PDF")

    publisher = Mock()

    consumer = EventConsumer(extractor, publisher)
    consumer.on_message(channel, method, properties, body)

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.JOB_FAILED
    event_data = call_args[1]
    assert event_data["jobId"] == "job-err-1"
    assert "Corrupted PDF" in event_data["error"]

    channel.basic_ack.assert_called_once_with(delivery_tag=6)


def test_publishes_needs_review_for_low_confidence():
    """Can route low-confidence receipt to needs_review instead of auto-saving"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 7
    properties = Mock()

    body = _body(
        {
            "jobId": "job-low-1",
            "userId": "user-123",
            "storagePath": "/path/to/receipt.pdf",
            "fileType": "pdf",
        }
    )

    extractor = Mock()
    extractor.extract.return_value = "Store Receipt\nTotal: $12.50"
    extractor.needs_ocr.return_value = False

    classifier = Mock()
    classifier.classify.return_value = {"classification": "receipt", "confidence": 0.55}

    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Unknown Store",
        "total": 12.50,
        "lineItems": [{"name": "Item", "totalPrice": 12.50}],
    }

    publisher = Mock()

    consumer = EventConsumer(extractor, publisher, classifier, parser)
    consumer.on_message(channel, method, properties, body)

    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == EventType.RECEIPT_NEEDS_REVIEW
    event_data = call_args[1]
    assert event_data["jobId"] == "job-low-1"
    assert event_data["userId"] == "user-123"
    assert event_data["confidence"] == 0.55
    assert event_data["receipt"]["merchant"] == "Unknown Store"
