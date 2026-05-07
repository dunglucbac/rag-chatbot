import json


class EventPublisher:
    def __init__(self, channel, exchange="ingest.topic"):
        self.channel = channel
        self.exchange = exchange

    def publish(self, event_type: str, payload: dict):
        """Publish an event to RabbitMQ topic exchange"""
        message = json.dumps(payload)
        self.channel.basic_publish(
            exchange=self.exchange,
            routing_key=event_type,
            body=message,
            properties=None,
        )
