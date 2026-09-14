import json
from types import SimpleNamespace
from unittest.mock import Mock

from pika.exceptions import StreamLostError

from src.constants.event_types import EventType
from src.consumer.event_consumer import EventConsumer
from src.processing.ingestion_job_processor import IngestionJob, ProcessingResult


def _body(payload: object, correlation_id: str = "corr-123") -> bytes:
    return json.dumps(
        {
            "schemaVersion": 1,
            "eventId": "event-123",
            "eventType": EventType.DOC_PDF_PARSE_REQUESTED,
            "correlationId": correlation_id,
            "attempt": 1,
            "createdAt": "2026-09-14T00:00:00.000Z",
            "payload": payload,
        }
    ).encode()


def _delivery(tag: int = 1):
    return Mock(), SimpleNamespace(delivery_tag=tag)


def test_publishes_processor_result_then_acknowledges_delivery():
    channel, method = _delivery()
    processor = Mock()
    processor.process.return_value = ProcessingResult(
        EventType.DOC_PDF_PARSE_COMPLETED,
        {"jobId": "job-123", "extractedText": "Extracted text"},
    )
    publisher = Mock()

    EventConsumer(processor, publisher).on_message(
        channel,
        method,
        None,
        _body(
            {
                "jobId": "job-123",
                "userId": "user-456",
                "storagePath": "/path/to/file.pdf",
                "fileType": "pdf",
            }
        ),
    )

    processor.process.assert_called_once_with(
        IngestionJob(
            job_id="job-123",
            user_id="user-456",
            storage_path="/path/to/file.pdf",
            file_type="pdf",
        )
    )
    publisher.publish.assert_called_once_with(
        EventType.DOC_PDF_PARSE_COMPLETED,
        {"jobId": "job-123", "extractedText": "Extracted text"},
        correlation_id="corr-123",
    )
    channel.basic_ack.assert_called_once_with(delivery_tag=1)


def test_malformed_message_publishes_job_failed_and_acknowledges():
    channel, method = _delivery(2)
    processor = Mock()
    publisher = Mock()

    EventConsumer(processor, publisher).on_message(
        channel,
        method,
        None,
        b"not-json",
    )

    processor.process.assert_not_called()
    event_type, payload = publisher.publish.call_args.args
    assert event_type == EventType.JOB_FAILED
    assert payload["jobId"] == "unknown"
    assert payload["error"]
    channel.basic_ack.assert_called_once_with(delivery_tag=2)


def test_invalid_job_payload_preserves_job_id_in_failure_event():
    channel, method = _delivery(3)
    publisher = Mock()

    EventConsumer(Mock(), publisher).on_message(
        channel,
        method,
        None,
        _body(
            {
                "jobId": "job-invalid",
                "storagePath": "/path/to/file.txt",
                "fileType": "text",
            }
        ),
    )

    event_type, payload = publisher.publish.call_args.args
    assert event_type == EventType.JOB_FAILED
    assert payload == {
        "jobId": "job-invalid",
        "error": "payload.fileType must be 'pdf' or 'image'",
    }
    channel.basic_ack.assert_called_once_with(delivery_tag=3)


def test_processing_error_publishes_job_failed_and_acknowledges():
    channel, method = _delivery(4)
    processor = Mock()
    processor.process.side_effect = RuntimeError("Corrupted PDF")
    publisher = Mock()

    EventConsumer(processor, publisher).on_message(
        channel,
        method,
        None,
        _body(
            {
                "jobId": "job-error",
                "storagePath": "/path/to/bad.pdf",
                "fileType": "pdf",
            }
        ),
    )

    publisher.publish.assert_called_once_with(
        EventType.JOB_FAILED,
        {"jobId": "job-error", "error": "Corrupted PDF"},
        correlation_id="corr-123",
    )
    channel.basic_ack.assert_called_once_with(delivery_tag=4)


def test_result_publish_failure_leaves_delivery_unacknowledged():
    channel, method = _delivery(5)
    processor = Mock()
    processor.process.return_value = ProcessingResult(
        EventType.DOC_PDF_PARSE_COMPLETED,
        {"jobId": "job-123", "extractedText": "Extracted text"},
    )
    publisher = Mock()
    publisher.publish.side_effect = StreamLostError("Broken pipe")

    EventConsumer(processor, publisher).on_message(
        channel,
        method,
        None,
        _body(
            {
                "jobId": "job-123",
                "storagePath": "/path/to/file.pdf",
                "fileType": "pdf",
            }
        ),
    )

    publisher.publish.assert_called_once()
    channel.basic_ack.assert_not_called()


def test_job_failed_publish_failure_leaves_delivery_unacknowledged():
    channel, method = _delivery(6)
    processor = Mock()
    processor.process.side_effect = RuntimeError("Processing error")
    publisher = Mock()
    publisher.publish.side_effect = StreamLostError("Broken pipe")

    EventConsumer(processor, publisher).on_message(
        channel,
        method,
        None,
        _body(
            {
                "jobId": "job-error",
                "storagePath": "/path/to/file.pdf",
                "fileType": "pdf",
            }
        ),
    )

    publisher.publish.assert_called_once()
    channel.basic_ack.assert_not_called()
