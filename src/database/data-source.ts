import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { IngestionJob } from '../ingestion/ingestion-job.entity';

const config = configuration();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.pass,
  database: config.db.name,
  entities: [IngestionJob],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
