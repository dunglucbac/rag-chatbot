import {
  BaseEntity,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  IngestionClassification,
  IngestionFileType,
  IngestionJobStatus,
} from '@modules/ingestion/ingestion.types';

@Entity('ingestion_jobs')
export class IngestionJob extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ name: 'file_id' })
  declare fileId: string;

  @Column({ name: 'user_id' })
  declare userId: string;

  @Column({ name: 'original_filename' })
  declare originalFilename: string;

  @Column({ name: 'storage_path' })
  declare storagePath: string;

  @Column({ name: 'mime_type' })
  declare mimeType: string;

  @Column({
    name: 'file_type',
    type: 'enum',
    enum: ['pdf', 'image'],
    default: 'pdf',
  })
  declare fileType: IngestionFileType;

  @Column({
    name: 'classification',
    type: 'enum',
    enum: ['receipt', 'payment', 'document', 'unknown'],
    default: 'unknown',
  })
  declare classification: IngestionClassification;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'processing', 'needs_review', 'completed', 'failed'],
    default: 'pending',
  })
  declare status: IngestionJobStatus;

  @Column({ name: 'checksum_sha256', type: 'text', nullable: true })
  declare checksumSha256: string | null;

  @Column({ name: 'correlation_id', type: 'text', nullable: true })
  declare correlationId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  declare errorMessage: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  declare metadata: Record<string, unknown> | null;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  declare extractedText: string | null;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  declare chunkCount: number;

  @CreateDateColumn({ name: 'created_at' })
  declare createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  declare updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  declare completedAt: Date | null;
}
