// Serialized types for the /api/dashboard payload

export type SerializedPoolStats = {
  id: number;
  timestamp: string; // ISO string after JSON serialization
  runtime: number;
  users: number;
  workers: number;
  idle: number;
  disconnected: number;
  hashrate1m: number;
  hashrate5m: number;
  hashrate15m: number;
  hashrate1hr: number;
  hashrate6hr: number;
  hashrate1d: number;
  hashrate7d: number;
  diff: number;
  accepted: string; // bigint serialized to string
  rejected: string; // bigint serialized to string
  bestshare: number;
  SPS1m: number;
  SPS5m: number;
  SPS15m: number;
  SPS1h: number;
};

export type TopUserHashrate = {
  address: string;
  workerCount: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  bestShare: number;
  bestEver: number;
};

export type TopUserDifficulty = {
  address: string;
  workerCount: number;
  difficulty: number;
  hashrate1hr: number;
  hashrate1d: number;
  hashrate7d: number;
  bestShare: number;
};

export type OnlineDevice = {
  client: string;
  activeWorkers: number;
  uniqueUsers: number;
  hashrate1hr: number;
  bestEver: number;
};

export type HighScore = {
  rank: number;
  difficulty: number;
  device: string;
  timestamp: string; // ISO string after JSON serialization
};

export type DashboardLimits = {
  topUsers: number;
  onlineDevices: number;
  historicalPoints: number;
};

export type DashboardPayload = {
  version: number;
  generatedAt: string;
  latestStats: SerializedPoolStats;
  historicalStats: SerializedPoolStats[];
  topUserHashrates: TopUserHashrate[];
  topUserDifficulties: TopUserDifficulty[];
  topUserLoyalty: Array<{
    address: string;
    authorised: number;
    since?: string;
  }>;
  onlineDevices: OnlineDevice[];
  highScores: HighScore[];
  limits: DashboardLimits;
};
