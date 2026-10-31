import { EventType } from '@modules/common/event-types';

export const MESSAGE_QUEUE_EXCHANGE = 'ingest.topic';
export const MESSAGE_QUEUE_DEAD_LETTER_EXCHANGE = 'ingest.dlx';
export const MESSAGE_QUEUE_DEAD_LETTER_QUEUE = 'ingest.dead-letter.queue';
export const MESSAGE_QUEUE_IMAGE_QUEUE = 'ingest.image.queue';
export const MESSAGE_QUEUE_PDF_QUEUE = 'ingest.pdf.queue';
export const MESSAGE_QUEUE_STATUS_QUEUE = 'ingest.status.queue';
export const MESSAGE_QUEUE_RESULTS_QUEUE = 'ingest.results.queue';

export const MESSAGE_QUEUE_RAG_APP_QUEUES = [
  MESSAGE_QUEUE_STATUS_QUEUE,
  MESSAGE_QUEUE_RESULTS_QUEUE,
] as const;

export const MESSAGE_QUEUE_WORKER_QUEUES = [
  MESSAGE_QUEUE_PDF_QUEUE,
  MESSAGE_QUEUE_IMAGE_QUEUE,
] as const;

export const MESSAGE_QUEUE_BROKER_BINDINGS = [
  {
    queue: MESSAGE_QUEUE_PDF_QUEUE,
    routingKey: EventType.DOC_PDF_PARSE_REQUESTED,
  },
  {
    queue: MESSAGE_QUEUE_IMAGE_QUEUE,
    routingKey: EventType.IMAGE_CLASSIFY_REQUESTED,
  },
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: EventType.DOC_PDF_PARSE_COMPLETED,
  },
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: EventType.JOB_FAILED,
  },
  {
    queue: MESSAGE_QUEUE_RESULTS_QUEUE,
    routingKey: EventType.RECEIPT_PARSED,
  },
  {
    queue: MESSAGE_QUEUE_RESULTS_QUEUE,
    routingKey: EventType.PAYMENT_DETECTED,
  },
  {
    queue: MESSAGE_QUEUE_RESULTS_QUEUE,
    routingKey: EventType.RECEIPT_NEEDS_REVIEW,
  },
  {
    queue: MESSAGE_QUEUE_RESULTS_QUEUE,
    routingKey: EventType.RECEIPT_ITEMS_CATEGORIZE,
  },
] as const;
