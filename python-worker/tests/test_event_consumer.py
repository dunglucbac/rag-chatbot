import pytest
from unittest.mock import Mock, MagicMock
from src.consumer.event_consumer import EventConsumer


def test_can_process_pdf_parse_requested_event():
    """Can process a doc.pdf.parse.requested event and extract text"""
    # Mock RabbitMQ channel and message
    channel = Mock()
    method = Mock()
    method.delivery_tag = 1

    properties = Mock()
    body = b'{"jobId": "job-123", "storagePath": "/path/to/file.pdf", "fileType": "pdf"}'

    # Mock PDF extractor
    extractor = Mock()
    extractor.extract.return_value = "Extracted PDF text content"
    extractor.needs_ocr.return_value = False

    # Mock event publisher
    publisher = Mock()

    consumer = EventConsumer(extractor, publisher)
    consumer.on_message(channel, method, properties, body)

    # Verify extractor was called
    extractor.extract.assert_called_once_with("/path/to/file.pdf")

    # Verify completion event was published
    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == "doc.pdf.parse.completed"
    assert "job-123" in str(call_args[1])

    # Verify message was acknowledged
    channel.basic_ack.assert_called_once_with(delivery_tag=1)


def test_classifies_and_parses_receipt():
    """Can classify text as receipt and parse into structured data"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 2
    properties = Mock()
    body = b'{"jobId": "job-456", "storagePath": "/path/to/receipt.pdf", "fileType": "pdf"}'

    # Mock extractor
    extractor = Mock()
    extractor.extract.return_value = "Starbucks Receipt\nTotal: $12.50"
    extractor.needs_ocr.return_value = False

    # Mock classifier
    classifier = Mock()
    classifier.classify.return_value = {"classification": "receipt", "confidence": 0.95}

    # Mock parser
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Starbucks",
        "total": 12.50,
        "lineItems": [{"name": "Latte", "totalPrice": 4.50}]
    }

    # Mock publisher
    publisher = Mock()

    consumer = EventConsumer(extractor, publisher, classifier, parser)
    consumer.on_message(channel, method, properties, body)

    # Verify classification was called
    classifier.classify.assert_called_once()

    # Verify parser was called
    parser.parse.assert_called_once()

    # Verify receipt.parsed event was published
    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == "receipt.parsed"
    assert "Starbucks" in str(call_args[1])


def test_handles_image_classification_with_ocr():
    """Can process image.classify.requested event using OCR"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 3
    properties = Mock()
    body = b'{"jobId": "job-789", "storagePath": "/path/to/image.jpg", "fileType": "image"}'

    # Mock OCR extractor
    ocr_extractor = Mock()
    ocr_extractor.extract.return_value = "Starbucks Receipt\nTotal: $12.50"

    # Mock classifier
    classifier = Mock()
    classifier.classify.return_value = {"classification": "receipt", "confidence": 0.95}

    # Mock parser
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Starbucks",
        "total": 12.50,
        "lineItems": [{"name": "Latte", "totalPrice": 4.50}]
    }

    # Mock publisher
    publisher = Mock()

    consumer = EventConsumer(None, publisher, classifier, parser, ocr_extractor)
    consumer.on_message(channel, method, properties, body)

    # Verify OCR extractor was called
    ocr_extractor.extract.assert_called_once_with("/path/to/image.jpg")

    # Verify classification and parsing happened
    classifier.classify.assert_called_once()
    parser.parse.assert_called_once()

    # Verify receipt.parsed event was published
    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == "receipt.parsed"

def test_publishes_payment_detected_event():
    """Can classify as payment and publish payment.detected event"""
    channel = Mock()
    method = Mock()
    method.delivery_tag = 4
    properties = Mock()
    body = b'{"jobId": "job-999", "storagePath": "/path/to/payment.jpg", "fileType": "image"}'

    # Mock OCR extractor
    ocr_extractor = Mock()
    ocr_extractor.extract.return_value = "Bank Transfer\nAmount: $50.00\nTo: ABC Store"

    # Mock classifier
    classifier = Mock()
    classifier.classify.return_value = {"classification": "payment", "confidence": 0.90}

    # Mock publisher
    publisher = Mock()

    consumer = EventConsumer(None, publisher, classifier, None, ocr_extractor)
    consumer.on_message(channel, method, properties, body)

    # Verify payment.detected event was published
    publisher.publish.assert_called_once()
    call_args = publisher.publish.call_args[0]
    assert call_args[0] == "payment.detected"
    assert "job-999" in str(call_args[1])
