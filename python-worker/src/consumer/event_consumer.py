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
        message = json.loads(body)
        job_id = message["jobId"]

        try:
            user_id = message.get("userId")
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
                    payment_event = {
                        "jobId": job_id,
                        "extractedText": text,
                    }
                    self.publisher.publish(EventType.PAYMENT_DETECTED, payment_event)
                elif classification == "document" and self.chunker:
                    metadata = {"source": storage_path, "type": file_type}
                    chunks = self.chunker.chunk_with_metadata(text, metadata)
                    embed_event = {
                        "jobId": job_id,
                        "userId": user_id,
                        "chunks": chunks,
                    }
                    self.publisher.publish(EventType.DOC_CHUNKS_EMBED_REQUESTED, embed_event)
                else:
                    completion_event = {
                        "jobId": job_id,
                        "extractedText": text,
                    }
                    self.publisher.publish(EventType.DOC_PDF_PARSE_COMPLETED, completion_event)
            else:
                completion_event = {
                    "jobId": job_id,
                    "extractedText": text,
                }
                self.publisher.publish(EventType.DOC_PDF_PARSE_COMPLETED, completion_event)
        except Exception as e:
            self.publisher.publish(EventType.JOB_FAILED, {
                "jobId": job_id,
                "error": str(e),
            })

        # Acknowledge message
        channel.basic_ack(delivery_tag=method.delivery_tag)
