import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';

const config = configuration();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.pass,
  database: config.db.name,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
