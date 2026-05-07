import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { ReceiptItem } from './receipt-item.entity';

@Entity('receipts')
@Unique(['userId', 'merchant', 'purchasedAt', 'total', 'checksumSha256'])
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  merchant: string;

  @Column({ name: 'purchased_at' })
  purchasedAt: Date;

  @Column({ type: 'numeric' })
  total: number;

  @Column({ type: 'numeric', nullable: true })
  tax: number | null;

  @Column()
  currency: string;

  @Column()
  source: string;

  @Column({ name: 'raw_text', type: 'text', nullable: true })
  rawText: string | null;

  @Column({ name: 'checksum_sha256' })
  checksumSha256: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ReceiptItem, (item) => item.receipt, { cascade: true })
  items: ReceiptItem[];
}
