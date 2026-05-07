import json


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
                        self.publisher.publish("receipt.needs_review", {
                            "jobId": job_id,
                            "userId": user_id,
                            "confidence": confidence,
                            "receipt": receipt_data,
                        })
                    else:
                        self.publisher.publish("receipt.parsed", {
                            "jobId": job_id,
                            "userId": user_id,
                            "receipt": receipt_data,
                        })
                elif classification == "payment":
                    payment_event = {
                        "jobId": job_id,
                        "extractedText": text,
                    }
                    self.publisher.publish("payment.detected", payment_event)
                elif classification == "document" and self.chunker:
                    metadata = {"source": storage_path, "type": file_type}
                    chunks = self.chunker.chunk_with_metadata(text, metadata)
                    embed_event = {
                        "jobId": job_id,
                        "userId": user_id,
                        "chunks": chunks,
                    }
                    self.publisher.publish("doc.chunks.embed.requested", embed_event)
                else:
                    completion_event = {
                        "jobId": job_id,
                        "extractedText": text,
                    }
                    self.publisher.publish("doc.pdf.parse.completed", completion_event)
            else:
                completion_event = {
                    "jobId": job_id,
                    "extractedText": text,
                }
                self.publisher.publish("doc.pdf.parse.completed", completion_event)
        except Exception as e:
            self.publisher.publish("job.failed", {
                "jobId": job_id,
                "error": str(e),
            })

        # Acknowledge message
        channel.basic_ack(delivery_tag=method.delivery_tag)
