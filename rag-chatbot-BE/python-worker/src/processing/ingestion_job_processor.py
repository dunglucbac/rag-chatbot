import logging
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal, Protocol, cast

import pillow_heif
from PIL import Image, ImageOps

from src.constants.event_types import ClassificationType, EventType
from src.extractors.document_extractor import DocumentExtractor
from src.storage.object_storage import LocalObjectStorage, ObjectStorage

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

FileType = Literal["pdf", "image"]
HEIC_EXTENSIONS = {".heic", ".heif", ".heifs"}


class Classifier(Protocol):
    def classify(self, text: str, /) -> dict[str, Any]: ...


class ReceiptParser(Protocol):
    def parse(self, text: str, /) -> dict[str, Any]: ...

    def parse_payment(self, text: str, /) -> dict[str, Any]: ...


@dataclass(frozen=True)
class IngestionJob:
    job_id: str
    storage_key: str
    file_type: FileType
    user_id: str | None = None

    @classmethod
    def from_payload(cls, payload: object) -> "IngestionJob":
        if not isinstance(payload, Mapping):
            raise ValueError("payload must be an object")

        job_id = cls._required_text(payload, "jobId")
        storage_key = cls._required_text(payload, "storageKey")
        file_type = payload.get("fileType")
        if file_type not in {"pdf", "image"}:
            raise ValueError("payload.fileType must be 'pdf' or 'image'")

        user_id = payload.get("userId")
        if user_id is not None and not isinstance(user_id, str):
            raise ValueError("payload.userId must be a string when provided")

        return cls(
            job_id=job_id,
            storage_key=storage_key,
            file_type=cast(FileType, file_type),
            user_id=user_id,
        )

    @staticmethod
    def _required_text(payload: Mapping[object, object], field: str) -> str:
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"payload.{field} must be a non-empty string")
        return value


@dataclass(frozen=True)
class ProcessingResult:
    event_type: EventType
    payload: dict[str, Any]


class IngestionJobProcessor:
    """Process one ingestion job and produce its next event.

    OCR/text-derived receipts below ``RECEIPT_REVIEW_CONFIDENCE_THRESHOLD``
    are sent to the user for confirmation or correction without a vision call.
    """

    RECEIPT_REVIEW_CONFIDENCE_THRESHOLD = 0.9

    def __init__(
        self,
        extractor: DocumentExtractor,
        classifier: Classifier | None = None,
        parser: ReceiptParser | None = None,
        checkpoint: Callable[[], None] | None = None,
        object_storage: ObjectStorage | None = None,
    ):
        self._extractor = extractor
        self._classifier = classifier
        self._parser = parser
        self._checkpoint = checkpoint or (lambda: None)
        self._object_storage = object_storage or LocalObjectStorage()

    def process(self, job: IngestionJob) -> ProcessingResult:
        with self._prepared_input(job) as input_path:
            text = self._extractor.extract(input_path)

            if self._classifier is None:
                return self._completed(job, text)

            self._checkpoint()
            classification_result = self._classifier.classify(text)
            classification = ClassificationType(classification_result["classification"])
            logger.info("Classified as %s [jobId=%s]", classification, job.job_id)

            if classification == ClassificationType.RECEIPT and self._parser:
                return self._process_receipt(job, text)

            if classification == ClassificationType.PAYMENT:
                payment = (
                    self._normalize_purchased_at(self._parser.parse_payment(text))
                    if self._parser
                    else None
                )
                return ProcessingResult(
                    EventType.PAYMENT_DETECTED,
                    {
                        "jobId": job.job_id,
                        "userId": job.user_id,
                        "extractedText": text,
                        **({"payment": payment} if payment else {}),
                    },
                )

            return self._completed(job, text)

    def _process_receipt(
        self,
        job: IngestionJob,
        text: str,
    ) -> ProcessingResult:
        """Parse OCR-derived text and route uncertain receipts to user review.

        The receipt parser's final confidence—not the classifier's
        confidence—determines the outcome. Values below
        ``RECEIPT_REVIEW_CONFIDENCE_THRESHOLD`` publish
        ``receipt.needs_review``; all other values publish ``receipt.parsed``.
        """
        assert self._parser is not None

        self._checkpoint()
        receipt = self._parser.parse(text)
        receipt = self._normalize_purchased_at(receipt)

        # The classifier determines that this is a receipt; the parser is the
        # authority on whether OCR-derived receipt fields are reliable enough
        # to accept without review.
        confidence = float(receipt.get("confidence", 1.0))
        if confidence < self.RECEIPT_REVIEW_CONFIDENCE_THRESHOLD:
            return ProcessingResult(
                EventType.RECEIPT_NEEDS_REVIEW,
                {
                    "jobId": job.job_id,
                    "userId": job.user_id,
                    "confidence": confidence,
                    "receipt": receipt,
                    "rawText": text,
                },
            )

        return ProcessingResult(
            EventType.RECEIPT_PARSED,
            {
                "jobId": job.job_id,
                "userId": job.user_id,
                "receipt": receipt,
                "rawText": text,
            },
        )

    @staticmethod
    def _completed(job: IngestionJob, text: str) -> ProcessingResult:
        return ProcessingResult(
            EventType.DOC_PDF_PARSE_COMPLETED,
            {"jobId": job.job_id, "extractedText": text},
        )

    @staticmethod
    def _normalize_purchased_at(receipt: dict[str, Any]) -> dict[str, Any]:
        """Convert LLM-produced dates to the UTC ISO timestamp required by events."""
        purchased_at = receipt.get("purchasedAt")
        if not isinstance(purchased_at, str) or not purchased_at.strip():
            return receipt

        try:
            parsed = datetime.fromisoformat(purchased_at.strip().replace("Z", "+00:00"))
        except ValueError:
            return receipt

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)

        return {
            **receipt,
            "purchasedAt": parsed.isoformat().replace("+00:00", "Z"),
        }

    @contextmanager
    def _prepared_input(self, job: IngestionJob) -> Iterator[str]:
        with self._object_storage.download(job.storage_key) as downloaded_path:
            source = Path(downloaded_path)
            if job.file_type != "image" or source.suffix.lower() not in HEIC_EXTENSIONS:
                yield downloaded_path
                return

            logger.info("Converting HEIC to temporary JPEG: %s", source)
            with TemporaryDirectory(prefix="ingestion-image-") as directory:
                jpeg_path = Path(directory) / f"{source.stem}.jpg"
                with Image.open(source) as image:
                    rgb_image = ImageOps.exif_transpose(image).convert("RGB")
                    try:
                        rgb_image.save(jpeg_path, "JPEG")
                    finally:
                        rgb_image.close()
                yield str(jpeg_path)
