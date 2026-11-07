import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('investment_budgets')
@Unique(['userId', 'month'])
export class InvestmentBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ length: 7 })
  month: string;

  @Column({ name: 'spent_micros', type: 'bigint', default: 0 })
  spentMicros: string;

  @Column({ name: 'reserved_micros', type: 'bigint', default: 0 })
  reservedMicros: string;
}
