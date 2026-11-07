import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('investment_documents')
@Unique(['userId', 'symbol', 'ingestionJobId'])
export class InvestmentDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ length: 10 })
  symbol: string;

  @Column({ name: 'ingestion_job_id' })
  ingestionJobId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'publication_date', type: 'date' })
  publicationDate: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'indexing' | 'ready' | 'failed';

  @Column({ name: 'page_count', type: 'int', default: 0 })
  pageCount: number;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
