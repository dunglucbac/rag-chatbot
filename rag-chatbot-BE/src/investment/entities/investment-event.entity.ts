import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('investment_events')
@Unique(['userId', 'requestId'])
@Unique(['supersedesId'])
export class InvestmentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'stock_id' })
  stockId: string;

  @Column({ name: 'request_id' })
  requestId: string;

  @Column({ name: 'supersedes_id', type: 'varchar', nullable: true })
  supersedesId: string | null;

  @Column({ length: 20 })
  type: string;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: string;

  @Column({ type: 'simple-json' })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
