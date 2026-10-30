import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
@Index(['sessionId', 'id'])
@Unique(['sessionId', 'ingestionJobId'])
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar' })
  role: 'user' | 'assistant' | 'upload';

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'ingestion_job_id', type: 'varchar', nullable: true })
  ingestionJobId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;
}
