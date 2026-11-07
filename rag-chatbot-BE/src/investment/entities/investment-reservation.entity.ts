import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('investment_reservations')
@Unique(['userId', 'requestId'])
export class InvestmentReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'budget_id' })
  budgetId: string;

  @Column({ name: 'request_id' })
  requestId: string;

  @Column({ name: 'reserved_micros', type: 'bigint' })
  reservedMicros: string;

  @Column({ name: 'actual_micros', type: 'bigint', nullable: true })
  actualMicros: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: 'pending' | 'settled' | 'released';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
