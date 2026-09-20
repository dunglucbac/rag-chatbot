export const INGESTION_FILE_TYPES = ['pdf', 'image'] as const;
export type IngestionFileType = (typeof INGESTION_FILE_TYPES)[number];

export enum IngestionClassification {
  RECEIPT = 'receipt',
  PAYMENT = 'payment',
  DOCUMENT = 'document',
  UNKNOWN = 'unknown',
}

export const INGESTION_CLASSIFICATIONS = Object.values(IngestionClassification);

export enum IngestionJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  NEEDS_REVIEW = 'needs_review',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export const INGESTION_JOB_STATUSES = Object.values(IngestionJobStatus);

export const INGESTION_EVENT_TYPES = [
  'doc.pdf.parse.requested',
  'image.classify.requested',
  'job.processing.started',
  'doc.pdf.parse.completed',
  'image.classify.completed',
  'job.failed',
] as const;
export type IngestionEventType = (typeof INGESTION_EVENT_TYPES)[number];

export type IngestionJobUpdate = {
  originalFilename?: string;
  storagePath?: string;
  mimeType?: string;
  fileType?: IngestionFileType;
  classification?: IngestionClassification;
  status?: IngestionJobStatus;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  extractedText?: string | null;
  chunkCount?: number;
  completedAt?: Date | null;
  checksumSha256?: string | null;
  correlationId?: string | null;
};

export type IngestionDispatchPayload = {
  jobId: string;
  fileId: string;
  userId: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileType: IngestionFileType;
  classification: IngestionClassification;
  fileExtension: string;
  fileSize: number;
  checksumSha256: string;
  sourceContext?: Record<string, unknown> | null;
  correlationId: string;
};
