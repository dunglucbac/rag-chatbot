export const MESSAGE_QUEUE_EXCHANGE = 'ingest.topic';
export const MESSAGE_QUEUE_IMAGE_QUEUE = 'ingest.image.queue';
export const MESSAGE_QUEUE_PDF_QUEUE = 'ingest.pdf.queue';
export const MESSAGE_QUEUE_UPLOAD_QUEUE = 'ingest.file.queue';

export const MESSAGE_QUEUE_BINDINGS = [
  {
    queue: MESSAGE_QUEUE_IMAGE_QUEUE,
    routingKey: 'ingest.image.uploaded',
  },
  {
    queue: MESSAGE_QUEUE_PDF_QUEUE,
    routingKey: 'ingest.pdf.uploaded',
  },
  {
    queue: MESSAGE_QUEUE_UPLOAD_QUEUE,
    routingKey: 'ingest.file.uploaded',
  },
] as const;
