import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('messages')
export class Message extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column()
  declare userId: string;

  @Column()
  declare threadId: string;

  @Column({ type: 'text' })
  declare content: string;

  @Column({ type: 'enum', enum: ['human', 'ai'] })
  declare role: 'human' | 'ai';

  @Column({ nullable: true })
  declare toolsUsed: string;

  @CreateDateColumn()
  declare createdAt: Date;
}
