export const INGESTION_SOURCE_TYPES = ['pdf', 'image', 'receipt'] as const;
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];

export const INGESTION_JOB_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;
export type IngestionJobStatus = (typeof INGESTION_JOB_STATUSES)[number];

export const INGESTION_EVENT_TYPES = ['ingest.file.detected'] as const;
export type IngestionEventType = (typeof INGESTION_EVENT_TYPES)[number];

export type IngestionJobUpdate = {
  originalFilename?: string;
  storagePath?: string;
  mimeType?: string;
  sourceType?: IngestionSourceType;
  status?: IngestionJobStatus;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  extractedText?: string | null;
  chunkCount?: number;
  completedAt?: Date | null;
};

export type IngestionDispatchPayload = {
  jobId: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sourceType: IngestionSourceType;
  fileExtension: string;
  fileSize: number;
};
