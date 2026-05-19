import json
import logging
import os
from src.constants.event_types import EventType, ClassificationType
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

HEIC_EXTENSIONS = {".heic", ".heif", ".heifs"}


class EventConsumer:
    def __init__(
        self,
        extractor_adapter,
        publisher,
        classifier=None,
        parser=None,
        chunker=None,
        connection=None,
    ):
        self.extractor_adapter = extractor_adapter
        self.publisher = publisher
        self.classifier = classifier
        self.parser = parser
        self.chunker = chunker
        self._connection = connection

    def _keepalive(self):
        """Process pending I/O events to keep RabbitMQ heartbeats alive during long operations."""
        if self._connection:
            self._connection.process_data_events(time_limit=0)

    def _convert_heic_if_needed(self, storage_path: str) -> str:
        """Convert HEIC to JPEG and return the new path. Returns original path if not HEIC."""
        ext = os.path.splitext(storage_path)[1].lower()
        if ext not in HEIC_EXTENSIONS:
            return storage_path

        logger.info("Converting HEIC to JPEG: %s", storage_path)
        jpeg_path = storage_path[: -len(ext)] + ".jpg"
        img = Image.open(storage_path)
        img.convert("RGB").save(jpeg_path, "JPEG")
        os.remove(storage_path)
        return jpeg_path

    @staticmethod
    def _should_try_vision(receipt_data: dict) -> bool:
        """Determine whether vision fallback should be attempted."""
        if receipt_data.get("discrepancy") is not None:
            return True
        confidence = receipt_data.get("confidence")
        return confidence is not None and confidence < 0.9

    def on_message(self, channel, method, properties, body):
        """Process incoming RabbitMQ message"""
        envelope = json.loads(body)
        payload = envelope.get("payload", {})
        job_id = payload.get("jobId", "unknown")
        correlation_id = envelope.get("correlationId", "unknown")
        event_type = envelope.get("eventType", "unknown")

        logger.info(
            "Received %s [correlationId=%s jobId=%s]",
            event_type,
            correlation_id,
            job_id,
        )

        try:
            user_id = payload.get("userId")
            storage_path = self._convert_heic_if_needed(payload["storagePath"])
            file_type = payload.get("fileType", "pdf")

            # Extract text via adapter (routes to correct extractor based on file_type + config)
            text = self.extractor_adapter.extract(storage_path, file_type)

            # Classify if classifier is available
            if self.classifier:
                self._keepalive()
                classification_result = self.classifier.classify(text)
                classification = classification_result["classification"]
                logger.info(
                    "Classified as %s [correlationId=%s jobId=%s]",
                    classification,
                    correlation_id,
                    job_id,
                )

                if classification == ClassificationType.RECEIPT and self.parser:
                    self._keepalive()
                    receipt_data = self.parser.parse(text)
                    classification_confidence = classification_result.get(
                        "confidence", 1.0
                    )

                    # Fall back to vision if OCR-based parse has discrepancy or low confidence
                    if file_type == "image" and self._should_try_vision(receipt_data):
                        try:
                            self._keepalive()
                            vision_data = self.parser.parse_with_vision(storage_path)
                            if vision_data.get("confidence", 0) > receipt_data.get(
                                "confidence", 0
                            ):
                                logger.info(
                                    "Vision fallback improved confidence %.2f -> %.2f [correlationId=%s]",
                                    receipt_data.get("confidence", 0),
                                    vision_data.get("confidence", 0),
                                    correlation_id,
                                )
                                receipt_data = vision_data
                        except Exception as e:
                            logger.warning(
                                "Vision fallback failed, using OCR result: %s [correlationId=%s]",
                                e,
                                correlation_id,
                            )

                    if classification_confidence < 0.7:
                        self.publisher.publish(
                            EventType.RECEIPT_NEEDS_REVIEW,
                            {
                                "jobId": job_id,
                                "userId": user_id,
                                "confidence": classification_confidence,
                                "receipt": receipt_data,
                            },
                            correlation_id=correlation_id,
                        )
                    else:
                        self.publisher.publish(
                            EventType.RECEIPT_PARSED,
                            {
                                "jobId": job_id,
                                "userId": user_id,
                                "receipt": receipt_data,
                            },
                            correlation_id=correlation_id,
                        )
                elif classification == ClassificationType.PAYMENT:
                    self.publisher.publish(
                        EventType.PAYMENT_DETECTED,
                        {
                            "jobId": job_id,
                            "extractedText": text,
                        },
                        correlation_id=correlation_id,
                    )
                elif classification == ClassificationType.DOCUMENT and self.chunker:
                    metadata = {"source": storage_path, "type": file_type}
                    chunks = self.chunker.chunk_with_metadata(text, metadata)
                    self.publisher.publish(
                        EventType.DOC_CHUNKS_EMBED_REQUESTED,
                        {
                            "jobId": job_id,
                            "userId": user_id,
                            "chunks": chunks,
                        },
                        correlation_id=correlation_id,
                    )
                else:
                    self.publisher.publish(
                        EventType.DOC_PDF_PARSE_COMPLETED,
                        {
                            "jobId": job_id,
                            "extractedText": text,
                        },
                        correlation_id=correlation_id,
                    )
            else:
                self.publisher.publish(
                    EventType.DOC_PDF_PARSE_COMPLETED,
                    {
                        "jobId": job_id,
                        "extractedText": text,
                    },
                    correlation_id=correlation_id,
                )
        except Exception as e:
            logger.exception(
                "Processing failed [correlationId=%s jobId=%s]", correlation_id, job_id
            )
            try:
                self.publisher.publish(
                    EventType.JOB_FAILED,
                    {
                        "jobId": job_id,
                        "error": str(e),
                    },
                    correlation_id=correlation_id,
                )
            except Exception:
                logger.warning(
                    "Failed to publish JOB_FAILED (connection dead), message will be redelivered "
                    "[correlationId=%s jobId=%s]",
                    correlation_id,
                    job_id,
                )
                # Don't ack — let RabbitMQ redeliver when we reconnect
                return

        channel.basic_ack(delivery_tag=method.delivery_tag)
