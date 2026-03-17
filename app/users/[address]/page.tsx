import { notFound } from 'next/navigation';

import UserPageClient from '../../../components/UserPageClient';
import {
  getUserWithWorkersAndStats,
  getUserHistoricalStats,
  getLatestPoolStats,
} from '../../../lib/api';
import { serializeData } from '../../../utils/helpers';
import { validateBitcoinAddress } from '../../../utils/validateBitcoinAddress';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function UserPage({
  params,
}: {
  params: { address: string };
}) {
  let address: string;
  try {
    address = decodeURIComponent(params.address);
  } catch {
    notFound();
  }
  if (!validateBitcoinAddress(address)) {
    notFound();
  }
  const [userORM, statsORM, historicalStatsORM] = await Promise.all([
    getUserWithWorkersAndStats(address),
    getLatestPoolStats(),
    getUserHistoricalStats(address),
  ]);

  if (!userORM) {
    notFound();
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

  return <UserPageClient initialData={initialData} address={address} />;
}
