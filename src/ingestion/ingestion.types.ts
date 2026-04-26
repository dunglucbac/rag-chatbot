export type IngestionSourceType = 'pdf' | 'image' | 'receipt';

export type IngestionJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

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

export type IngestionQueuePayload = {
  jobId: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
  sourceType: IngestionSourceType;
};
