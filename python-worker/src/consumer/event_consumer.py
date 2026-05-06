import json


class EventConsumer:
    def __init__(self, extractor, publisher, classifier=None, parser=None):
        self.extractor = extractor
        self.publisher = publisher
        self.classifier = classifier
        self.parser = parser

    def on_message(self, channel, method, properties, body):
        """Process incoming RabbitMQ message"""
        message = json.loads(body)
        job_id = message["jobId"]
        storage_path = message["storagePath"]

        # Extract text from PDF
        text = self.extractor.extract(storage_path)

        # Classify if classifier is available
        if self.classifier:
            classification_result = self.classifier.classify(text)
            classification = classification_result["classification"]

            if classification == "receipt" and self.parser:
                # Parse receipt into structured data
                receipt_data = self.parser.parse(text)
                event_payload = {
                    "jobId": job_id,
                    "receipt": receipt_data,
                }
                self.publisher.publish("receipt.parsed", event_payload)
            else:
                # Publish basic completion event
                completion_event = {
                    "jobId": job_id,
                    "extractedText": text,
                }
                self.publisher.publish("doc.pdf.parse.completed", completion_event)
        else:
            # No classifier, publish basic completion event
            completion_event = {
                "jobId": job_id,
                "extractedText": text,
            }
            self.publisher.publish("doc.pdf.parse.completed", completion_event)

        # Acknowledge message
        channel.basic_ack(delivery_tag=method.delivery_tag)
