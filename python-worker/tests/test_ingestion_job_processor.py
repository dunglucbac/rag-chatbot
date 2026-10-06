from pathlib import Path
from contextlib import contextmanager
from unittest.mock import Mock

import pytest
from PIL import Image

from src.constants.event_types import EventType
from src.processing.ingestion_job_processor import IngestionJob, IngestionJobProcessor


def _job(file_type="pdf", storage_key="/path/to/file.pdf") -> IngestionJob:
    return IngestionJob(
        job_id="job-123",
        user_id="user-456",
        storage_key=storage_key,
        file_type=file_type,
    )


def test_returns_extracted_text_when_classification_is_disabled():
    extractor = Mock()
    extractor.extract.return_value = "Extracted text"

    result = IngestionJobProcessor(extractor).process(_job())

    assert result.event_type == EventType.DOC_PDF_PARSE_COMPLETED
    assert result.payload == {
        "jobId": "job-123",
        "extractedText": "Extracted text",
    }


def test_downloads_object_key_to_ephemeral_worker_storage():
    extractor = Mock()
    extractor.extract.return_value = "Extracted text"

    class ObjectStorage:
        @contextmanager
        def download(self, key: str):
            assert key == "raw/remote-source.pdf"
            yield "/tmp/worker-download.pdf"

    IngestionJobProcessor(extractor, object_storage=ObjectStorage()).process(
        _job(storage_key="raw/remote-source.pdf")
    )

    extractor.extract.assert_called_once_with("/tmp/worker-download.pdf")


def test_parses_receipt_and_returns_receipt_event():
    extractor = Mock()
    extractor.extract.return_value = "Coffee Shop\nTotal: 4.50"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Coffee Shop",
        "total": 4.50,
        "purchasedAt": "2026-09-20",
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(_job())

    assert result.event_type == EventType.RECEIPT_PARSED
    assert result.payload == {
        "jobId": "job-123",
        "userId": "user-456",
        "receipt": {
            "merchant": "Coffee Shop",
            "total": 4.50,
            "purchasedAt": "2026-09-20T00:00:00Z",
        },
        "rawText": "Coffee Shop\nTotal: 4.50",
    }


def test_low_receipt_parser_confidence_returns_review_event():
    extractor = Mock()
    extractor.extract.return_value = "Fuzzy receipt"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Unknown",
        "total": 10.0,
        "confidence": 0.55,
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(_job())

    assert result.event_type == EventType.RECEIPT_NEEDS_REVIEW
    assert result.payload["confidence"] == 0.55
    assert result.payload["userId"] == "user-456"
    assert result.payload["rawText"] == "Fuzzy receipt"


def test_high_receipt_parser_confidence_returns_parsed_event():
    extractor = Mock()
    extractor.extract.return_value = "Clear receipt"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.55,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Coffee Shop",
        "total": 10.0,
        "confidence": 0.95,
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(_job())

    assert result.event_type == EventType.RECEIPT_PARSED
    assert result.payload["rawText"] == "Clear receipt"


def test_payment_event_includes_user_id_when_structured_parsing_is_unavailable():
    extractor = Mock()
    extractor.extract.return_value = "Transfer 50.00"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "payment",
        "confidence": 0.9,
    }

    result = IngestionJobProcessor(extractor, classifier).process(
        _job(file_type="image", storage_key="/path/to/payment.jpg")
    )

    assert result.event_type == EventType.PAYMENT_DETECTED
    assert result.payload == {
        "jobId": "job-123",
        "userId": "user-456",
        "extractedText": "Transfer 50.00",
    }


def test_payment_event_includes_document_derived_transfer_facts():
    extractor = Mock()
    extractor.extract.return_value = "Transfer 50.00 VND to Power Company"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "payment",
        "confidence": 0.9,
    }
    parser = Mock()
    parser.parse_payment.return_value = {
        "merchant": "Power Company",
        "purchasedAt": "2026-09-20",
        "total": 50.0,
        "currency": "VND",
        "confidence": 0.91,
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(_job())

    assert result.event_type == EventType.PAYMENT_DETECTED
    assert result.payload["payment"] == {
        "merchant": "Power Company",
        "purchasedAt": "2026-09-20T00:00:00Z",
        "total": 50.0,
        "currency": "VND",
        "confidence": 0.91,
    }


@pytest.mark.parametrize("file_type", ["image", "pdf"])
@pytest.mark.parametrize(
    "confidence,event_type",
    [
        (0.0, EventType.RECEIPT_NEEDS_REVIEW),
        (0.5, EventType.RECEIPT_NEEDS_REVIEW),
        (0.7, EventType.RECEIPT_NEEDS_REVIEW),
        (0.89, EventType.RECEIPT_NEEDS_REVIEW),
        (0.9, EventType.RECEIPT_PARSED),
        (0.95, EventType.RECEIPT_PARSED),
    ],
)
def test_receipts_use_text_only_and_route_uncertain_data_to_user_review(
    file_type, confidence, event_type
):
    extractor = Mock()
    extractor.extract.return_value = "OCR receipt text"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Store",
        "confidence": confidence,
        "discrepancy": {"difference": 30} if confidence < 0.9 else None,
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(
        _job(file_type=file_type, storage_key="/path/to/receipt")
    )

    parser.parse.assert_called_once_with("OCR receipt text")
    parser.parse_with_vision.assert_not_called()
    assert result.event_type == event_type
    assert result.payload["receipt"] == parser.parse.return_value
    assert result.payload["userId"] == "user-456"
    assert result.payload["rawText"] == "OCR receipt text"
    if event_type == EventType.RECEIPT_NEEDS_REVIEW:
        assert result.payload["confidence"] == confidence


def test_heic_conversion_preserves_source_and_cleans_temporary_jpeg(tmp_path):
    source = tmp_path / "receipt.heic"
    Image.new("RGB", (64, 64), "white").save(source, format="HEIF")
    converted_path = None

    def extract(path: str) -> str:
        nonlocal converted_path
        converted_path = Path(path)
        assert converted_path.exists()
        assert converted_path.suffix == ".jpg"
        return "Receipt text"

    extractor = Mock()
    extractor.extract.side_effect = extract

    IngestionJobProcessor(extractor).process(
        _job(file_type="image", storage_key=str(source))
    )

    assert source.exists()
    assert converted_path is not None
    assert not converted_path.exists()


@pytest.mark.parametrize(
    "payload,error",
    [
        ({}, "payload.jobId must be a non-empty string"),
        (
            {"jobId": "job-1", "storageKey": "/file", "fileType": "text"},
            "payload.fileType must be 'pdf' or 'image'",
        ),
    ],
)
def test_validates_ingestion_job_payload(payload, error):
    with pytest.raises(ValueError, match=error):
        IngestionJob.from_payload(payload)
