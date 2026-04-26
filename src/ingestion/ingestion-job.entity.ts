import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { IngestionJobStatus, IngestionSourceType } from './ingestion.types';

@Entity('ingestion_jobs')
export class IngestionJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalFilename: string;

  @Column()
  storagePath: string;

  @Column()
  mimeType: string;

  @Column({ default: 'pdf' })
  sourceType: IngestionSourceType;

  @Column({ default: 'pending' })
  status: IngestionJobStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ type: 'int', default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
