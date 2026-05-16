import type {
  IngestionClassification,
  IngestionFileType,
  IngestionJobStatus,
} from '@modules/ingestion/ingestion.types';
import type { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';

export class IngestionJobDto {
  declare id: string;
  declare fileId: string;
  declare userId: string;
  declare originalFilename: string;
  declare storagePath: string;
  declare mimeType: string;
  declare fileType: IngestionFileType;
  declare classification: IngestionClassification;
  declare status: IngestionJobStatus;
  declare checksumSha256: string | null;
  declare correlationId: string | null;
  declare errorMessage: string | null;
  declare chunkCount: number;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare completedAt: Date | null;
  declare metadata: Record<string, unknown> | null;

  static fromEntity(entity: IngestionJob): IngestionJobDto {
    const dto = new IngestionJobDto();
    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.userId = entity.userId;
    dto.originalFilename = entity.originalFilename;
    dto.storagePath = entity.storagePath;
    dto.mimeType = entity.mimeType;
    dto.fileType = entity.fileType;
    dto.classification = entity.classification;
    dto.status = entity.status;
    dto.checksumSha256 = entity.checksumSha256;
    dto.correlationId = entity.correlationId;
    dto.errorMessage = entity.errorMessage;
    dto.chunkCount = entity.chunkCount;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.completedAt = entity.completedAt;
    dto.metadata = entity.metadata;
    return dto;
  }
}
