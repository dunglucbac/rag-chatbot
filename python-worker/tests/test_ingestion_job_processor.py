from pathlib import Path
from unittest.mock import Mock

import pytest
from PIL import Image

from src.constants.event_types import EventType
from src.processing.ingestion_job_processor import IngestionJob, IngestionJobProcessor


def _job(file_type="pdf", storage_path="/path/to/file.pdf") -> IngestionJob:
    return IngestionJob(
        job_id="job-123",
        user_id="user-456",
        storage_path=storage_path,
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


def test_parses_receipt_and_returns_receipt_event():
    extractor = Mock()
    extractor.extract.return_value = "Coffee Shop\nTotal: 4.50"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {"merchant": "Coffee Shop", "total": 4.50}

    result = IngestionJobProcessor(extractor, classifier, parser).process(_job())

    assert result.event_type == EventType.RECEIPT_PARSED
    assert result.payload == {
        "jobId": "job-123",
        "userId": "user-456",
        "receipt": {"merchant": "Coffee Shop", "total": 4.50},
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


def test_payment_event_includes_user_id():
    extractor = Mock()
    extractor.extract.return_value = "Transfer 50.00"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "payment",
        "confidence": 0.9,
    }

    result = IngestionJobProcessor(extractor, classifier).process(
        _job(file_type="image", storage_path="/path/to/payment.jpg")
    )

    assert result.event_type == EventType.PAYMENT_DETECTED
    assert result.payload == {
        "jobId": "job-123",
        "userId": "user-456",
        "extractedText": "Transfer 50.00",
    }


def test_uses_better_vision_result_for_uncertain_image_receipt():
    extractor = Mock()
    extractor.extract.return_value = "Uncertain receipt"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Store",
        "confidence": 0.5,
        "discrepancy": {"difference": 30},
    }
    parser.parse_with_vision.return_value = {
        "merchant": "Store",
        "confidence": 0.95,
        "discrepancy": None,
    }

    result = IngestionJobProcessor(extractor, classifier, parser).process(
        _job(file_type="image", storage_path="/path/to/receipt.jpg")
    )

    parser.parse_with_vision.assert_called_once_with("/path/to/receipt.jpg")
    assert result.payload["receipt"] == parser.parse_with_vision.return_value


def test_vision_fallback_can_be_disabled_for_uncertain_receipts():
    extractor = Mock()
    extractor.extract.return_value = "Uncertain receipt"
    classifier = Mock()
    classifier.classify.return_value = {
        "classification": "receipt",
        "confidence": 0.95,
    }
    parser = Mock()
    parser.parse.return_value = {
        "merchant": "Store",
        "confidence": 0.5,
        "discrepancy": {"difference": 30},
    }

    result = IngestionJobProcessor(
        extractor,
        classifier,
        parser,
        vision_fallback_confidence_threshold=0,
    ).process(_job(file_type="image", storage_path="/path/to/receipt.jpg"))

    parser.parse_with_vision.assert_not_called()
    assert result.payload["receipt"] == parser.parse.return_value


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
        _job(file_type="image", storage_path=str(source))
    )

    assert source.exists()
    assert converted_path is not None
    assert not converted_path.exists()


@pytest.mark.parametrize(
    "payload,error",
    [
        ({}, "payload.jobId must be a non-empty string"),
        (
            {"jobId": "job-1", "storagePath": "/file", "fileType": "text"},
            "payload.fileType must be 'pdf' or 'image'",
        ),
    ],
)
def test_validates_ingestion_job_payload(payload, error):
    with pytest.raises(ValueError, match=error):
        IngestionJob.from_payload(payload)
