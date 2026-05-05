export const INGESTION_FILE_TYPES = ['pdf', 'image'] as const;
export type IngestionFileType = (typeof INGESTION_FILE_TYPES)[number];

export const INGESTION_CLASSIFICATIONS = [
  'receipt',
  'payment',
  'document',
  'unknown',
] as const;
export type IngestionClassification =
  (typeof INGESTION_CLASSIFICATIONS)[number];

export const INGESTION_JOB_STATUSES = [
  'pending',
  'processing',
  'needs_review',
  'completed',
  'failed',
] as const;
export type IngestionJobStatus = (typeof INGESTION_JOB_STATUSES)[number];

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
