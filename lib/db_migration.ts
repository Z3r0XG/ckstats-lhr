import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { PoolStats } from './entities/PoolStats';
import { User } from './entities/User';
import { UserStats } from './entities/UserStats';
import { Worker } from './entities/Worker';
import { WorkerStats } from './entities/WorkerStats';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || (() => { throw new Error('DB_HOST is not set'); })(),
  port: parseInt(process.env.DB_PORT || (() => { throw new Error('DB_PORT is not set'); })()),
  username: process.env.DB_USER || (() => { throw new Error('DB_USER is not set'); })(),
  password: process.env.DB_PASSWORD || (() => { throw new Error('DB_PASSWORD is not set'); })(),
  database: process.env.DB_NAME || (() => { throw new Error('DB_NAME is not set'); })(),
  entities: [PoolStats, User, UserStats, Worker, WorkerStats],
  migrations: ['migrations/*.ts'],
  logging: process.env.NODE_ENV === 'development',
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        }
      : false,
});

let initialized = false;

export async function getDb() {
  if (!initialized) {
    await AppDataSource.initialize();
    initialized = true;
  }
  return AppDataSource;
}

export default AppDataSource;
