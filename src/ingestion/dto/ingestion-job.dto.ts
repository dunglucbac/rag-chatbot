import type {
  IngestionJobStatus,
  IngestionSourceType,
} from '@modules/ingestion/ingestion.types';
import type { IngestionJob } from '@modules/ingestion/entities/ingestion-job.entity';

export class IngestionJobDto {
  declare id: string;
  declare originalFilename: string;
  declare mimeType: string;
  declare sourceType: IngestionSourceType;
  declare status: IngestionJobStatus;
  declare errorMessage: string | null;
  declare chunkCount: number;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare completedAt: Date | null;
  declare metadata: Record<string, unknown> | null;

  static fromEntity(entity: IngestionJob): IngestionJobDto {
    const dto = new IngestionJobDto();
    dto.id = entity.id;
    dto.originalFilename = entity.originalFilename;
    dto.mimeType = entity.mimeType;
    dto.sourceType = entity.sourceType;
    dto.status = entity.status;
    dto.errorMessage = entity.errorMessage;
    dto.chunkCount = entity.chunkCount;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.completedAt = entity.completedAt;
    dto.metadata = entity.metadata;
    return dto;
  }
}
