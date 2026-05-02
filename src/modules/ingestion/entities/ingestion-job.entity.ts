import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  INGESTION_CLASSIFICATIONS,
  INGESTION_FILE_TYPES,
  INGESTION_JOB_STATUSES,
  type IngestionClassification,
  type IngestionFileType,
  type IngestionJobStatus,
} from '@modules/ingestion/ingestion.types';

@Entity({ name: 'ingestion_jobs' })
export class IngestionJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ name: 'file_id', type: 'varchar', length: 255 })
  fileId: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 512 })
  originalFilename: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 1024 })
  storagePath: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 255 })
  mimeType: string;

  @Column({
    name: 'file_type',
    type: 'varchar',
    length: 32,
    enum: INGESTION_FILE_TYPES,
  })
  fileType: IngestionFileType;

  @Column({
    name: 'classification',
    type: 'varchar',
    length: 32,
    enum: INGESTION_CLASSIFICATIONS,
    default: 'unknown',
  })
  classification: IngestionClassification;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    enum: INGESTION_JOB_STATUSES,
    default: 'pending',
  })
  status: IngestionJobStatus;

  @Column({ name: 'checksum_sha256', type: 'varchar', length: 64 })
  checksumSha256: string;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64 })
  correlationId: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ name: 'chunk_count', type: 'int', nullable: true })
  chunkCount: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
