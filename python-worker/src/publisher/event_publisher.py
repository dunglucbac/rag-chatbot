import json


class EventPublisher:
    def __init__(self, channel):
        self.channel = channel

    def publish(self, event_type: str, payload: dict):
        """Publish an event to RabbitMQ"""
        message = json.dumps(payload)
        self.channel.basic_publish(
            exchange='',
            routing_key=event_type,
            body=message
        )
