import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'path';
import configuration from '../config/configuration';

const config = configuration();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.pass,
  database: config.db.name,
  entities: [join(__dirname, '..', '**', '*.entity.js')],
  migrations: [join(__dirname, 'migrations', '*.js')],
  synchronize: false,
});
