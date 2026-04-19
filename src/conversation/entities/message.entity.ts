import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  threadId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ['human', 'ai'] })
  role: 'human' | 'ai';

  @Column({ nullable: true })
  toolsUsed: string;

  @CreateDateColumn()
  createdAt: Date;
}
