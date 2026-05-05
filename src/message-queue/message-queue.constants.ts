export const MESSAGE_QUEUE_EXCHANGE = 'ingest.topic';
export const MESSAGE_QUEUE_IMAGE_QUEUE = 'ingest.image.queue';
export const MESSAGE_QUEUE_PDF_QUEUE = 'ingest.pdf.queue';
export const MESSAGE_QUEUE_STATUS_QUEUE = 'ingest.status.queue';

export const MESSAGE_QUEUE_BINDINGS = [
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: 'job.processing.started',
  },
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: 'doc.pdf.parse.completed',
  },
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: 'image.classify.completed',
  },
  {
    queue: MESSAGE_QUEUE_STATUS_QUEUE,
    routingKey: 'job.failed',
  },
] as const;
