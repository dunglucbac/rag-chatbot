import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { WebSearchLog } from '../web-search/entities/web-search-log.entity';
import { Receipt } from '../receipt/entities/receipt.entity';
import { ReceiptItem } from '../receipt/entities/receipt-item.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [IngestionJob, WebSearchLog, Receipt, ReceiptItem],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
