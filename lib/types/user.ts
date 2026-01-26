import { User } from '../entities/User';
import { UserStats } from '../entities/UserStats';

export interface UserWithWorkers extends User {
  workers: any[]; // Worker with latestStats
  stats: UserStats[];
}

export interface UserDataPayload {
  user: UserWithWorkers;
  poolStats: any; // PoolStats
  historicalStats: UserStats[];
  generatedAt: string;
}
