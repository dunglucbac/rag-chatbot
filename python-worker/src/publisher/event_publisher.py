import json
import uuid
from datetime import datetime, timezone


class EventPublisher:
    def __init__(self, channel, exchange="ingest.topic"):
        self.channel = channel
        self.exchange = exchange

    def publish(self, event_type: str, payload: dict, correlation_id: str = None, schema_version: int = 1, attempt: int = 1):
        """Publish an event to RabbitMQ topic exchange wrapped in EventEnvelope"""
        envelope = {
            "schemaVersion": schema_version,
            "eventId": str(uuid.uuid4()),
            "eventType": event_type,
            "correlationId": correlation_id or str(uuid.uuid4()),
            "attempt": attempt,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        message = json.dumps(envelope)
        self.channel.basic_publish(
            exchange=self.exchange,
            routing_key=event_type,
            body=message,
            properties=None,
        )
