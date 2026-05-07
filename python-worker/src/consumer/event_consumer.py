import json


class EventConsumer:
    def __init__(self, extractor, publisher, classifier=None, parser=None, ocr_extractor=None):
        self.extractor = extractor
        self.publisher = publisher
        self.classifier = classifier
        self.parser = parser
        self.ocr_extractor = ocr_extractor

    def on_message(self, channel, method, properties, body):
        """Process incoming RabbitMQ message"""
        message = json.loads(body)
        job_id = message["jobId"]
        storage_path = message["storagePath"]
        file_type = message.get("fileType", "pdf")

        # Extract text based on file type
        if file_type == "image" and self.ocr_extractor:
            text = self.ocr_extractor.extract(storage_path)
        elif self.extractor:
            text = self.extractor.extract(storage_path)
            # Fallback to OCR if text is too short
            if self.ocr_extractor and self.extractor.needs_ocr(text):
                text = self.ocr_extractor.extract(storage_path)
        else:
            text = ""

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
            elif classification == "payment":
                # Publish payment detected event
                payment_event = {
                    "jobId": job_id,
                    "extractedText": text,
                }
                self.publisher.publish("payment.detected", payment_event)
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
