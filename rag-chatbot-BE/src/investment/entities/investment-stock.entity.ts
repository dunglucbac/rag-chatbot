import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('investment_stocks')
@Unique(['userId', 'symbol'])
export class InvestmentStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ length: 10 })
  symbol: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
