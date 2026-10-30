import json
import logging
from collections.abc import Mapping
from typing import Any, Protocol, cast

from src.constants.event_types import EventType
from src.consumer.event_contracts import IngestionEventEnvelope
from src.processing.ingestion_job_processor import (
    IngestionJob,
    IngestionJobProcessor,
    ProcessingResult,
)

logger = logging.getLogger(__name__)


class EventPublisherProtocol(Protocol):
    def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
    ) -> None: ...


class AcknowledgingChannel(Protocol):
    def basic_ack(self, *, delivery_tag: int) -> None: ...


class Delivery(Protocol):
    delivery_tag: int


class EventConsumer:
    def __init__(
        self,
        processor: IngestionJobProcessor,
        publisher: EventPublisherProtocol,
    ):
        self.processor = processor
        self.publisher = publisher

    def on_message(
        self,
        channel: AcknowledgingChannel,
        method: Delivery,
        _: object,
        body: bytes,
    ) -> None:
        """Process one RabbitMQ delivery and acknowledge its published outcome."""
        job_id = "unknown"
        correlation_id = "unknown"

        try:
            envelope = self._decode_envelope(body)
            correlation_id = self._optional_text(
                envelope.get("correlationId"), "unknown"
            )
            event_type = self._optional_text(envelope.get("eventType"), "unknown")
            payload = envelope.get("payload")
            if isinstance(payload, Mapping):
                job_id = self._optional_text(payload.get("jobId"), "unknown")

            job = IngestionJob.from_payload(payload)
            job_id = job.job_id
            logger.info(
                "Received %s [correlationId=%s jobId=%s]",
                event_type,
                correlation_id,
                job_id,
            )

            result: ProcessingResult = self.processor.process(job)
        except Exception as error:
            logger.exception(
                "Processing failed [correlationId=%s jobId=%s]", correlation_id, job_id
            )
            if not self._publish_failure(job_id, correlation_id, error):
                return
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return

        try:
            self.publisher.publish(
                result.event_type,
                result.payload,
                correlation_id=correlation_id,
            )
        except Exception:
            logger.warning(
                "Failed to publish processing result; message will be redelivered "
                "[correlationId=%s jobId=%s]",
                correlation_id,
                job_id,
                exc_info=True,
            )
            return

        channel.basic_ack(delivery_tag=method.delivery_tag)

    def _publish_failure(
        self,
        job_id: str,
        correlation_id: str,
        error: Exception,
    ) -> bool:
        try:
            self.publisher.publish(
                EventType.JOB_FAILED,
                {"jobId": job_id, "error": str(error)},
                correlation_id=correlation_id,
            )
            return True
        except Exception:
            logger.warning(
                "Failed to publish JOB_FAILED; message will be redelivered "
                "[correlationId=%s jobId=%s]",
                correlation_id,
                job_id,
                exc_info=True,
            )
            return False

    @staticmethod
    def _decode_envelope(body: bytes) -> IngestionEventEnvelope:
        decoded = json.loads(body)
        if not isinstance(decoded, Mapping):
            raise ValueError("event envelope must be an object")
        return cast(IngestionEventEnvelope, decoded)

    @staticmethod
    def _optional_text(value: object, default: str) -> str:
        return value if isinstance(value, str) and value else default
