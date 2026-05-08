import json
from src.constants.event_types import EventType


class EventConsumer:
    def __init__(self, extractor, publisher, classifier=None, parser=None, ocr_extractor=None, chunker=None):
        self.extractor = extractor
        self.publisher = publisher
        self.classifier = classifier
        self.parser = parser
        self.ocr_extractor = ocr_extractor
        self.chunker = chunker

    def on_message(self, channel, method, properties, body):
        """Process incoming RabbitMQ message"""
        envelope = json.loads(body)
        payload = envelope.get("payload", {})
        job_id = payload.get("jobId", "unknown")

        try:
            user_id = payload.get("userId")
            storage_path = payload["storagePath"]
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

                if classification == "receipt" and self.parser:
                    receipt_data = self.parser.parse(text)
                    confidence = classification_result.get("confidence", 1.0)

                    if confidence < 0.7:
                        self.publisher.publish(EventType.RECEIPT_NEEDS_REVIEW, {
                            "jobId": job_id,
                            "userId": user_id,
                            "confidence": confidence,
                            "receipt": receipt_data,
                        })
                    else:
                        self.publisher.publish(EventType.RECEIPT_PARSED, {
                            "jobId": job_id,
                            "userId": user_id,
                            "receipt": receipt_data,
                        })
                elif classification == "payment":
                    self.publisher.publish(EventType.PAYMENT_DETECTED, {
                        "jobId": job_id,
                        "extractedText": text,
                    })
                elif classification == "document" and self.chunker:
                    metadata = {"source": storage_path, "type": file_type}
                    chunks = self.chunker.chunk_with_metadata(text, metadata)
                    self.publisher.publish(EventType.DOC_CHUNKS_EMBED_REQUESTED, {
                        "jobId": job_id,
                        "userId": user_id,
                        "chunks": chunks,
                    })
                else:
                    self.publisher.publish(EventType.DOC_PDF_PARSE_COMPLETED, {
                        "jobId": job_id,
                        "extractedText": text,
                    })
            else:
                self.publisher.publish(EventType.DOC_PDF_PARSE_COMPLETED, {
                    "jobId": job_id,
                    "extractedText": text,
                })
        except Exception as e:
            self.publisher.publish(EventType.JOB_FAILED, {
                "jobId": job_id,
                "error": str(e),
            })

        channel.basic_ack(delivery_tag=method.delivery_tag)
