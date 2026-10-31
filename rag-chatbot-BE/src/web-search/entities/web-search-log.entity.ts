import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('web_search_logs')
export class WebSearchLog extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column()
  declare userId: string;

  @Column({ type: 'text' })
  declare query: string;

  @Column({ type: 'text' })
  declare url: string;

  @Column({ default: false })
  declare scraped: boolean;

  @CreateDateColumn()
  declare timestamp: Date;
}
