import { SerializedPoolStats } from './dashboard';

// Serialized types for the /api/users/[address] payload

export type SerializedWorkerStats = {
  id: number;
  workerId: number;
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  started: string; // bigint serialized to string
  shares: number; // cumulative share difficulty (double precision)
  bestShare: number;
  bestEver: number;
  timestamp: string; // ISO string after JSON serialization
};

export type SerializedWorker = {
  id: number;
  name: string;
  createdAt: string; // ISO string after JSON serialization
  updatedAt: string; // ISO string after JSON serialization
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastUpdate: string; // ISO string after JSON serialization
  shares: number; // cumulative share difficulty (double precision)
  bestShare: number;
  bestEver: number;
  userAddress: string;
  userAgent: string;
  userAgentRaw: string | null;
  latestStats: SerializedWorkerStats | null;
};

export type SerializedUserStats = {
  id: number;
  userAddress: string;
  hashrate1m: number;
  hashrate5m: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  lastShare: string; // bigint serialized to string
  workerCount: number;
  shares: number; // cumulative share difficulty (double precision)
  bestShare: number;
  bestEver: number;
  timestamp: string; // ISO string after JSON serialization
};

export type SerializedUser = {
  address: string;
  createdAt: string; // ISO string after JSON serialization
  updatedAt: string; // ISO string after JSON serialization
  authorised: string; // bigint serialized to string
  workers: SerializedWorker[];
  stats: SerializedUserStats[];
  isActive: boolean;
  isPublic: boolean;
};

export type UserDataPayload = {
  user: SerializedUser;
  poolStats: SerializedPoolStats;
  historicalStats: SerializedUserStats[];
  generatedAt: string;
};
