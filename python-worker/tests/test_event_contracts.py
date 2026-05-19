import json
from unittest.mock import Mock
from src.consumer.event_consumer import EventConsumer
from src.constants.event_types import EventType


def _body(payload):
    return json.dumps({"payload": payload}).encode()


class TestEventPayloadContracts:
    """Integration tests validating event payloads match PRD schemas"""

    def test_receipt_parsed_event_matches_schema(self):
        channel = Mock()
        method = Mock()
        method.delivery_tag = 1
        properties = Mock()

        adapter = Mock()
        adapter.extract.return_value = "Starbucks Receipt\nTotal: $12.50"

        classifier = Mock()
        classifier.classify.return_value = {
            "classification": "receipt",
            "confidence": 0.95,
        }

        parser = Mock()
        parser.parse.return_value = {
            "merchant": "Starbucks",
            "purchasedAt": "2026-05-05T10:30:00Z",
            "total": 12.50,
            "tax": 1.15,
            "currency": "USD",
            "lineItems": [
                {"name": "Latte", "quantity": 1, "unitPrice": 4.50, "totalPrice": 4.50}
            ],
        }

        publisher = Mock()
        consumer = EventConsumer(adapter, publisher, classifier, parser)
        consumer.on_message(
            channel,
            method,
            properties,
            _body(
                {
                    "jobId": "job-123",
                    "userId": "user-456",
                    "storagePath": "/path/to/receipt.pdf",
                    "fileType": "pdf",
                }
            ),
        )

        publisher.publish.assert_called_once()
        event_type, payload = publisher.publish.call_args[0]
        assert event_type == EventType.RECEIPT_PARSED

        assert "jobId" in payload
        assert "userId" in payload
        assert "receipt" in payload
        receipt = payload["receipt"]
        assert isinstance(receipt["merchant"], str)
        assert isinstance(receipt["purchasedAt"], str)
        assert isinstance(receipt["total"], (int, float))
        assert isinstance(receipt["currency"], str)

    def test_payment_detected_event_matches_schema(self):
        channel = Mock()
        method = Mock()
        method.delivery_tag = 2
        properties = Mock()

        adapter = Mock()
        adapter.extract.return_value = "Bank Transfer\nAmount: $50.00\nTo: ABC Store"

        classifier = Mock()
        classifier.classify.return_value = {
            "classification": "payment",
            "confidence": 0.90,
        }

        publisher = Mock()
        consumer = EventConsumer(adapter, publisher, classifier)
        consumer.on_message(
            channel,
            method,
            properties,
            _body(
                {
                    "jobId": "job-999",
                    "userId": "user-456",
                    "storagePath": "/path/to/payment.jpg",
                    "fileType": "image",
                }
            ),
        )

        publisher.publish.assert_called_once()
        event_type, payload = publisher.publish.call_args[0]
        assert event_type == EventType.PAYMENT_DETECTED

        assert "jobId" in payload
        assert payload["jobId"] == "job-999"
        assert "extractedText" in payload
        assert isinstance(payload["extractedText"], str)

    def test_doc_chunks_embed_requested_matches_schema(self):
        channel = Mock()
        method = Mock()
        method.delivery_tag = 3
        properties = Mock()

        adapter = Mock()
        adapter.extract.return_value = "A" * 2000

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
        consumer = EventConsumer(adapter, publisher, classifier, chunker=chunker)
        consumer.on_message(
            channel,
            method,
            properties,
            _body(
                {
                    "jobId": "job-doc-1",
                    "userId": "user-123",
                    "storagePath": "/path/to/doc.pdf",
                    "fileType": "pdf",
                }
            ),
        )

        publisher.publish.assert_called_once()
        event_type, payload = publisher.publish.call_args[0]
        assert event_type == EventType.DOC_CHUNKS_EMBED_REQUESTED

        assert payload["jobId"] == "job-doc-1"
        assert payload["userId"] == "user-123"
        assert "chunks" in payload
        assert isinstance(payload["chunks"], list)
        assert len(payload["chunks"]) >= 1
        for chunk in payload["chunks"]:
            assert "content" in chunk
            assert "metadata" in chunk
            assert isinstance(chunk["content"], str)
            assert isinstance(chunk["metadata"], dict)

    def test_job_failed_event_matches_schema(self):
        channel = Mock()
        method = Mock()
        method.delivery_tag = 4
        properties = Mock()

        adapter = Mock()
        adapter.extract.side_effect = Exception("PDF is corrupted beyond recovery")

        publisher = Mock()
        consumer = EventConsumer(adapter, publisher)
        consumer.on_message(
            channel,
            method,
            properties,
            _body(
                {
                    "jobId": "job-err-1",
                    "storagePath": "/path/to/bad.pdf",
                    "fileType": "pdf",
                }
            ),
        )

        publisher.publish.assert_called_once()
        event_type, payload = publisher.publish.call_args[0]
        assert event_type == EventType.JOB_FAILED
        assert payload["jobId"] == "job-err-1"
        assert "error" in payload
        assert isinstance(payload["error"], str)
        assert len(payload["error"]) > 0

    def test_receipt_needs_review_includes_confidence(self):
        channel = Mock()
        method = Mock()
        method.delivery_tag = 5
        properties = Mock()

        adapter = Mock()
        adapter.extract.return_value = "Fuzzy receipt text"

        classifier = Mock()
        classifier.classify.return_value = {
            "classification": "receipt",
            "confidence": 0.55,
        }

        parser = Mock()
        parser.parse.return_value = {
            "merchant": "Unknown",
            "total": 10.00,
            "currency": "USD",
        }

        publisher = Mock()
        consumer = EventConsumer(adapter, publisher, classifier, parser)
        consumer.on_message(
            channel,
            method,
            properties,
            _body(
                {
                    "jobId": "job-low-1",
                    "userId": "user-123",
                    "storagePath": "/path/to/receipt.pdf",
                    "fileType": "pdf",
                }
            ),
        )

        event_type, payload = publisher.publish.call_args[0]
        assert event_type == EventType.RECEIPT_NEEDS_REVIEW
        assert payload["confidence"] == 0.55
        assert payload["userId"] == "user-123"
        assert "receipt" in payload
