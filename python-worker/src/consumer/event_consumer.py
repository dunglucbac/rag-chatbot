import json
import logging
import os
from src.constants.event_types import EventType, ClassificationType
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

HEIC_EXTENSIONS = {'.heic', '.heif', '.heifs'}


class EventConsumer:
    def __init__(
        self,
        extractor,
        publisher,
        classifier=None,
        parser=None,
        ocr_extractor=None,
        chunker=None,
    ):
        self.extractor = extractor
        self.publisher = publisher
        self.classifier = classifier
        self.parser = parser
        self.ocr_extractor = ocr_extractor
        self.chunker = chunker

    def _convert_heic_if_needed(self, storage_path: str) -> str:
        """Convert HEIC to JPEG and return the new path. Returns original path if not HEIC."""
        ext = os.path.splitext(storage_path)[1].lower()
        if ext not in HEIC_EXTENSIONS:
            return storage_path

        logger.info("Converting HEIC to JPEG: %s", storage_path)
        jpeg_path = storage_path[:-len(ext)] + '.jpg'
        img = Image.open(storage_path)
        img.convert('RGB').save(jpeg_path, 'JPEG')
        os.remove(storage_path)
        return jpeg_path

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

            # Extract text based on file type
            if file_type == "image" and self.ocr_extractor:
                text = self.ocr_extractor.extract(storage_path)
            elif self.extractor:
                text = self.extractor.extract(storage_path)
                if self.ocr_extractor and self.extractor.needs_ocr(text):
                    text = self.ocr_extractor.extract(storage_path)
            else:
                text = ""

            # Classify if classifier is available
            if self.classifier:
                classification_result = self.classifier.classify(text)
                classification = classification_result["classification"]
                logger.info(
                    "Classified as %s [correlationId=%s jobId=%s]",
                    classification,
                    correlation_id,
                    job_id,
                )

                if classification == ClassificationType.RECEIPT and self.parser:
                    receipt_data = self.parser.parse(text)
                    confidence = classification_result.get("confidence", 1.0)

                    if confidence < 0.7:
                        self.publisher.publish(
                            EventType.RECEIPT_NEEDS_REVIEW,
                            {
                                "jobId": job_id,
                                "userId": user_id,
                                "confidence": confidence,
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
            self.publisher.publish(
                EventType.JOB_FAILED,
                {
                    "jobId": job_id,
                    "error": str(e),
                },
                correlation_id=correlation_id,
            )

        channel.basic_ack(delivery_tag=method.delivery_tag)
