import DashboardClient from '../components/DashboardClient';
import {
  getHistoricalPoolStats,
  getLatestPoolStats,
  getOnlineDevices,
  getTopBestDiffs,
  getTopUserDifficulties,
  getTopUserHashrates,
} from '../lib/api';
import { serializeData } from '../utils/helpers';

export default async function Home() {
  try {
    const [
      latestStatsORM,
      historicalStatsORM,
      topHashrates,
      topDifficulties,
      onlineDevices,
      highScores,
    ] = await Promise.all([
      getLatestPoolStats(),
      getHistoricalPoolStats(),
      getTopUserHashrates(10),
      getTopUserDifficulties(10),
      getOnlineDevices(10000),
      getTopBestDiffs(10),
    ]);

    if (!latestStatsORM) {
      return (
        <main className="container mx-auto p-4">
          <p>No stats available at the moment. Please try again later.</p>
        </main>
      );
    }

    const latestStats = serializeData(latestStatsORM);
    const historicalStats = serializeData(historicalStatsORM);

    const initialPayload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      latestStats,
      historicalStats,
      topUserHashrates: serializeData(topHashrates),
      topUserDifficulties: serializeData(topDifficulties),
      onlineDevices: serializeData(onlineDevices),
      highScores: serializeData(highScores),
      limits: {
        topUsers: 10,
        onlineDevices: 10000,
        historicalPoints: historicalStats?.length ?? 0,
      },
    };

    return (
      <main className="container mx-auto p-4">
        <DashboardClient initialData={initialPayload} />
      </main>
    );
  } catch (error) {
    console.error('Error fetching pool stats:', error);
    return (
      <main className="container mx-auto p-4">
        <p>
          An error occurred while fetching the stats. Please try again later.
        </p>
      </main>
    );
  }
}
