import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Receipt } from './receipt.entity';

@Entity('receipt_items')
export class ReceiptItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'receipt_id' })
  receiptId: string;

  @Column()
  name: string;

  @Column({ type: 'numeric', nullable: true })
  quantity: number | null;

  @Column({ name: 'unit_price', type: 'numeric', nullable: true })
  unitPrice: number | null;

  @Column({ name: 'total_price', type: 'numeric' })
  totalPrice: number;

  @Column({ type: 'text', nullable: true })
  category: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Receipt, (receipt) => receipt.items)
  @JoinColumn({ name: 'receipt_id' })
  receipt: Receipt;
}
