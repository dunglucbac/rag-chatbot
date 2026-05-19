import logging
import os
import signal
import sys
import time
from dotenv import load_dotenv

import pika
import anthropic

from src.extractors.pdf_extractor import PDFExtractor
from src.extractors.ocr_extractor import OCRExtractor
from src.extractors.extractor_adapter import ExtractorAdapter
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

logger = logging.getLogger(__name__)


class Worker:
    def __init__(self):
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://localhost")
        self.exchange = os.getenv("RABBITMQ_EXCHANGE", "ingest.topic")
        self.pdf_queue = os.getenv("RABBITMQ_PDF_QUEUE", "ingest.pdf.queue")
        self.image_queue = os.getenv("RABBITMQ_IMAGE_QUEUE", "ingest.image.queue")
        self.prefetch_count = int(os.getenv("RABBITMQ_PREFETCH_COUNT", "10"))
        self.connection = None
        self.channel = None
        self._running = False

    def start(self):
        self._running = True
        self._connect()

        while self._running:
            try:
                self.channel.start_consuming()
            except (
                pika.exceptions.StreamLostError,
                pika.exceptions.AMQPConnectionError,
            ) as e:
                logger.warning("Connection lost: %s. Reconnecting in 5s...", e)
                self._reconnect()
            except KeyboardInterrupt:
                self.stop()
                break

    def _connect(self):
        params = pika.URLParameters(self.rabbitmq_url)
        params.heartbeat = 120
        self.connection = pika.BlockingConnection(params)
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
        extractors = {
            "pdf": PDFExtractor(),
            "tesseract": OCRExtractor(),
        }
        routing = {
            "pdf": os.getenv("PDF_EXTRACTOR", "pdf"),
            "image": os.getenv("IMAGE_EXTRACTOR", "tesseract"),
        }
        extractor_adapter = ExtractorAdapter(extractors, routing)

        chunker = ChunkingService(chunk_size=1000, overlap=200)

        # LLM clients are lazily initialized; pass None if credentials not set
        llm_client = self._build_llm_client()
        classifier = ClassificationService(llm_client) if llm_client else None
        parser = ReceiptParser(llm_client) if llm_client else None

        publisher = EventPublisher(self.channel, self.exchange)
        consumer = EventConsumer(
            extractor_adapter,
            publisher,
            classifier,
            parser,
            chunker,
            connection=self.connection,
        )

        # Start consuming
        self.channel.basic_consume(
            queue=self.pdf_queue, on_message_callback=consumer.on_message
        )
        self.channel.basic_consume(
            queue=self.image_queue, on_message_callback=consumer.on_message
        )

        logger.info(
            "Worker started. Listening on %s, %s [exchange=%s prefetch=%d]",
            self.pdf_queue,
            self.image_queue,
            self.exchange,
            self.prefetch_count,
        )

    def _reconnect(self):
        """Clean up dead connection and reconnect."""
        try:
            if self.channel:
                self.channel.close()
        except Exception:
            pass
        try:
            if self.connection:
                self.connection.close()
        except Exception:
            pass
        self.channel = None
        self.connection = None

        time.sleep(5)
        self._connect()

    def stop(self):
        logger.info("Shutting down worker...")
        self._running = False
        try:
            if self.channel:
                self.channel.stop_consuming()
        except Exception:
            pass
        try:
            if self.connection:
                self.connection.close()
        except Exception:
            pass
        sys.exit(0)

    def _setup_queue(self, queue_name: str, routing_key: str):
        self.channel.queue_declare(queue=queue_name, durable=True)
        self.channel.queue_bind(
            queue=queue_name, exchange=self.exchange, routing_key=routing_key
        )

    def _build_llm_client(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY not set, LLM services disabled")
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
