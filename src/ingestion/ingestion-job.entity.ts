import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { IngestionJobStatus, IngestionSourceType } from './ingestion.types';

@Entity('ingestion_jobs')
export class IngestionJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'original_filename' })
  originalFilename: string;

  @Column({ name: 'storage_path' })
  storagePath: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'source_type', type: 'enum', enum: ['pdf', 'image', 'receipt'], default: 'pdf' })
  sourceType: IngestionSourceType;

  @Column({ name: 'status', type: 'enum', enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' })
  status: IngestionJobStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
