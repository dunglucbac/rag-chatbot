import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('web_search_logs')
export class WebSearchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  query: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ default: false })
  scraped: boolean;

  @CreateDateColumn()
  timestamp: Date;
}
