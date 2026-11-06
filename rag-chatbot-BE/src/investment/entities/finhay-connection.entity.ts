import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('finhay_connections')
export class FinhayConnection {
  @PrimaryColumn({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ name: 'encrypted_data', type: 'text' })
  encryptedData: string;

  @Column({ name: 'state_hash', type: 'varchar', nullable: true, unique: true })
  stateHash: string | null;

  @Column({ name: 'state_expires_at', type: 'bigint', nullable: true })
  stateExpiresAt: string | null;
}
