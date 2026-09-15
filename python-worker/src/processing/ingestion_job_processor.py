import logging
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal, Protocol, cast

import pillow_heif
from PIL import Image, ImageOps

from src.constants.event_types import ClassificationType, EventType

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

FileType = Literal["pdf", "image"]
HEIC_EXTENSIONS = {".heic", ".heif", ".heifs"}


class TextExtractor(Protocol):
    def extract(self, file_path: str, /) -> str: ...


class Classifier(Protocol):
    def classify(self, text: str, /) -> dict[str, Any]: ...


class ReceiptParser(Protocol):
    def parse(self, text: str, /) -> dict[str, Any]: ...

    def parse_with_vision(self, image_path: str, /) -> dict[str, Any]: ...


class Chunker(Protocol):
    def chunk_with_metadata(
        self, text: str, metadata: dict[str, str], /
    ) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class IngestionJob:
    job_id: str
    storage_path: str
    file_type: FileType
    user_id: str | None = None

    @classmethod
    def from_payload(cls, payload: object) -> "IngestionJob":
        if not isinstance(payload, Mapping):
            raise ValueError("payload must be an object")

        job_id = cls._required_text(payload, "jobId")
        storage_path = cls._required_text(payload, "storagePath")
        file_type = payload.get("fileType")
        if file_type not in {"pdf", "image"}:
            raise ValueError("payload.fileType must be 'pdf' or 'image'")

        user_id = payload.get("userId")
        if user_id is not None and not isinstance(user_id, str):
            raise ValueError("payload.userId must be a string when provided")

        return cls(
            job_id=job_id,
            storage_path=storage_path,
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
    """Process one Ingestion Job and produce its next event."""

    def __init__(
        self,
        extractor: TextExtractor,
        classifier: Classifier | None = None,
        parser: ReceiptParser | None = None,
        chunker: Chunker | None = None,
        checkpoint: Callable[[], None] | None = None,
        vision_fallback_confidence_threshold: float = 0.9,
    ):
        if not isinstance(vision_fallback_confidence_threshold, (int, float)) or not (
            0 <= vision_fallback_confidence_threshold <= 1
        ):
            raise ValueError(
                "vision_fallback_confidence_threshold must be between 0 and 1"
            )

        self._extractor = extractor
        self._classifier = classifier
        self._parser = parser
        self._chunker = chunker
        self._checkpoint = checkpoint or (lambda: None)
        self._vision_fallback_confidence_threshold = (
            vision_fallback_confidence_threshold
        )

    def process(self, job: IngestionJob) -> ProcessingResult:
        with self._prepared_input(job) as input_path:
            text = self._extractor.extract(input_path)

            if self._classifier is None:
                return self._completed(job, text)

            self._checkpoint()
            classification_result = self._classifier.classify(text)
            classification = ClassificationType(
                classification_result["classification"]
            )
            logger.info("Classified as %s [jobId=%s]", classification, job.job_id)

            if classification == ClassificationType.RECEIPT and self._parser:
                return self._process_receipt(
                    job,
                    text,
                    input_path,
                    classification_result,
                )

            if classification == ClassificationType.PAYMENT:
                return ProcessingResult(
                    EventType.PAYMENT_DETECTED,
                    {
                        "jobId": job.job_id,
                        "userId": job.user_id,
                        "extractedText": text,
                    },
                )

            if classification == ClassificationType.DOCUMENT and self._chunker:
                chunks = self._chunker.chunk_with_metadata(
                    text,
                    {"source": job.storage_path, "type": job.file_type},
                )
                return ProcessingResult(
                    EventType.DOC_CHUNKS_EMBED_REQUESTED,
                    {
                        "jobId": job.job_id,
                        "userId": job.user_id,
                        "chunks": chunks,
                    },
                )

            return self._completed(job, text)

    def _process_receipt(
        self,
        job: IngestionJob,
        text: str,
        input_path: str,
        classification_result: dict[str, Any],
    ) -> ProcessingResult:
        assert self._parser is not None

        self._checkpoint()
        receipt = self._parser.parse(text)
        if job.file_type == "image" and self._should_try_vision(receipt):
            receipt = self._try_vision(input_path, receipt, job.job_id)

        confidence = float(classification_result.get("confidence", 1.0))
        if confidence < 0.7:
            return ProcessingResult(
                EventType.RECEIPT_NEEDS_REVIEW,
                {
                    "jobId": job.job_id,
                    "userId": job.user_id,
                    "confidence": confidence,
                    "receipt": receipt,
                },
            )

        return ProcessingResult(
            EventType.RECEIPT_PARSED,
            {
                "jobId": job.job_id,
                "userId": job.user_id,
                "receipt": receipt,
            },
        )

    def _try_vision(
        self,
        image_path: str,
        receipt: dict[str, Any],
        job_id: str,
    ) -> dict[str, Any]:
        assert self._parser is not None

        try:
            self._checkpoint()
            vision_receipt = self._parser.parse_with_vision(image_path)
            if self._confidence(vision_receipt) > self._confidence(receipt):
                logger.info(
                    "Vision fallback improved confidence %.2f -> %.2f [jobId=%s]",
                    self._confidence(receipt),
                    self._confidence(vision_receipt),
                    job_id,
                )
                return vision_receipt
        except Exception as error:
            logger.warning(
                "Vision fallback failed, using OCR result: %s [jobId=%s]",
                error,
                job_id,
            )

        return receipt

    @staticmethod
    def _completed(job: IngestionJob, text: str) -> ProcessingResult:
        return ProcessingResult(
            EventType.DOC_PDF_PARSE_COMPLETED,
            {"jobId": job.job_id, "extractedText": text},
        )

    def _should_try_vision(self, receipt: dict[str, Any]) -> bool:
        """Use vision only when the text-only LLM result is below the threshold."""
        confidence = receipt.get("confidence")
        return (
            isinstance(confidence, (int, float))
            and confidence < self._vision_fallback_confidence_threshold
        )

    @staticmethod
    def _confidence(receipt: dict[str, Any]) -> float:
        confidence = receipt.get("confidence")
        return float(confidence) if isinstance(confidence, (int, float)) else 0.0

    @contextmanager
    def _prepared_input(self, job: IngestionJob) -> Iterator[str]:
        source = Path(job.storage_path)
        if job.file_type != "image" or source.suffix.lower() not in HEIC_EXTENSIONS:
            yield job.storage_path
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
