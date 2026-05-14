import logging
import os
import signal
import sys
from dotenv import load_dotenv

import pika
import anthropic

from src.extractors.pdf_extractor import PDFExtractor
from src.extractors.ocr_extractor import OCRExtractor
from src.constants.event_types import EventType
from src.services.classification_service import ClassificationService
from src.services.receipt_parser import ReceiptParser
from src.services.chunking_service import ChunkingService
from src.consumer.event_consumer import EventConsumer
from src.publisher.event_publisher import EventPublisher

# override=True so .env values take precedence over existing system env vars
load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)


class Worker:
    def __init__(self):
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://localhost")
        self.exchange = os.getenv("RABBITMQ_EXCHANGE", "ingest.topic")
        self.pdf_queue = os.getenv("RABBITMQ_PDF_QUEUE", "ingest.pdf.queue")
        self.image_queue = os.getenv("RABBITMQ_IMAGE_QUEUE", "ingest.image.queue")
        self.prefetch_count = int(os.getenv("RABBITMQ_PREFETCH_COUNT", "10"))
        self.connection = None
        self.channel = None

    def start(self):
        self.connection = pika.BlockingConnection(pika.URLParameters(self.rabbitmq_url))
        self.channel = self.connection.channel()

        # Fair dispatch: each worker gets at most prefetch_count unacked messages
        self.channel.basic_qos(prefetch_count=self.prefetch_count)

        # Declare the topic exchange
        self.channel.exchange_declare(
            exchange=self.exchange, exchange_type="topic", durable=True
        )

        # Declare and bind queues
        self._setup_queue(self.pdf_queue, EventType.DOC_PDF_PARSE_REQUESTED)
        self._setup_queue(self.image_queue, EventType.IMAGE_CLASSIFY_REQUESTED)

        # Build the processing pipeline
        pdf_extractor = PDFExtractor()
        ocr_extractor = OCRExtractor()
        chunker = ChunkingService(chunk_size=1000, overlap=200)

        # LLM clients are lazily initialized; pass None if credentials not set
        llm_client = self._build_llm_client()
        classifier = ClassificationService(llm_client) if llm_client else None
        parser = ReceiptParser(llm_client) if llm_client else None

        publisher = EventPublisher(self.channel, self.exchange)
        consumer = EventConsumer(
            pdf_extractor, publisher, classifier, parser, ocr_extractor, chunker
        )

        # Start consuming
        self.channel.basic_consume(
            queue=self.pdf_queue, on_message_callback=consumer.on_message
        )
        self.channel.basic_consume(
            queue=self.image_queue, on_message_callback=consumer.on_message
        )

        print(f"Worker started. Listening on {self.pdf_queue}, {self.image_queue}")
        print(f"Exchange: {self.exchange}, Prefetch: {self.prefetch_count}")

        try:
            self.channel.start_consuming()
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        print("Shutting down worker...")
        if self.channel:
            self.channel.stop_consuming()
        if self.connection:
            self.connection.close()
        sys.exit(0)

    def _setup_queue(self, queue_name: str, routing_key: str):
        self.channel.queue_declare(queue=queue_name, durable=True)
        self.channel.queue_bind(
            queue=queue_name, exchange=self.exchange, routing_key=routing_key
        )

    def _build_llm_client(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            print("Warning: ANTHROPIC_API_KEY not set, LLM services disabled")
            return None

        base_url = os.getenv("ANTHROPIC_BASE_URL")
        return anthropic.Anthropic(api_key=api_key, base_url=base_url)


def main():
    worker = Worker()

    def handle_signal(signum, frame):
        worker.stop()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    worker.start()


if __name__ == "__main__":
    main()
