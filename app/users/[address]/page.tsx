import UserPageClient from '../../../components/UserPageClient';
import {
  getUserWithWorkersAndStats,
  getUserHistoricalStats,
  getLatestPoolStats,
} from '../../../lib/api';
import { serializeData } from '../../../utils/helpers';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function UserPage({
  params,
}: {
  params: { address: string };
}) {
  const [userORM, statsORM, historicalStatsORM] = await Promise.all([
    getUserWithWorkersAndStats(params.address),
    getLatestPoolStats(),
    getUserHistoricalStats(params.address),
  ]);

  if (!userORM) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4 break-words text-accent">
          User Not Found
        </h1>
        <p>The requested user could not be found.</p>
      </div>
    );
  }

  const user = serializeData(userORM);
  const poolStats = serializeData(statsORM);
  const historicalStats = serializeData(historicalStatsORM);

  const initialData = {
    user,
    poolStats,
    historicalStats,
    generatedAt: new Date().toISOString(),
  };

  return <UserPageClient initialData={initialData} address={params.address} />;
}
