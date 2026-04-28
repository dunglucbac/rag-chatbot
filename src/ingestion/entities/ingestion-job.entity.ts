import {
  BaseEntity,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  IngestionJobStatus,
  IngestionSourceType,
} from '@modules/ingestion/ingestion.types';

@Entity('ingestion_jobs')
export class IngestionJob extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ name: 'original_filename' })
  declare originalFilename: string;

  @Column({ name: 'storage_path' })
  declare storagePath: string;

  @Column({ name: 'mime_type' })
  declare mimeType: string;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: ['pdf', 'image', 'receipt'],
    default: 'pdf',
  })
  declare sourceType: IngestionSourceType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  })
  declare status: IngestionJobStatus;

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
