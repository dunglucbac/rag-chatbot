import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { WebSearchLog } from '../web-search/entities/web-search-log.entity';
import { Message } from '../conversation/entities/message.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [IngestionJob, WebSearchLog, Message],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
