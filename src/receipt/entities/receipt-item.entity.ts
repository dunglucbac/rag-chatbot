import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Receipt } from './receipt.entity';

export enum ReceiptCategorizationStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

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

  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  @Column({
    name: 'categorization_status',
    type: 'varchar',
    default: ReceiptCategorizationStatus.PENDING,
  })
  categorizationStatus: ReceiptCategorizationStatus;

  @Column({ name: 'category_confidence', type: 'numeric', nullable: true })
  categoryConfidence: number | null;

  @Column({ name: 'taxonomy_version', type: 'varchar', nullable: true })
  taxonomyVersion: string | null;

  @Column({
    name: 'classification_metadata',
    type: 'simple-json',
    nullable: true,
  })
  classificationMetadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Receipt, (receipt) => receipt.items)
  @JoinColumn({ name: 'receipt_id' })
  receipt: Receipt;
}
