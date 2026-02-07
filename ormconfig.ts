import { DataSourceOptions } from 'typeorm';

import { PoolStats } from './lib/entities/PoolStats';
import { User } from './lib/entities/User';
import { UserStats } from './lib/entities/UserStats';
import { Worker } from './lib/entities/Worker';
import { WorkerStats } from './lib/entities/WorkerStats';

const config: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [PoolStats, User, UserStats, Worker, WorkerStats],
  migrations: ['migrations/*.ts'],
  // IMPORTANT: Keep synchronize disabled - use migrations only
  // TypeORM's auto-sync can reset default values and cause unexpected schema changes
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl: {
    rejectUnauthorized: false,
  },
};

export default config;
