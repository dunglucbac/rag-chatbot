export enum EventType {
  DOC_PDF_PARSE_REQUESTED = 'doc.pdf.parse.requested',
  IMAGE_CLASSIFY_REQUESTED = 'image.classify.requested',
  DOC_PDF_PARSE_COMPLETED = 'doc.pdf.parse.completed',
  JOB_FAILED = 'job.failed',
  RECEIPT_PARSED = 'receipt.parsed',
  PAYMENT_DETECTED = 'payment.detected',
  RECEIPT_NEEDS_REVIEW = 'receipt.needs_review',
  RECEIPT_ITEMS_CATEGORIZE = 'receipt.items.categorize',
}
