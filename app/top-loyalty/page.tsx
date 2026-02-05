import React from 'react';

import TopUserLoyaltyClient from '../../components/TopUserLoyaltyClient';
import { getTopUserLoyalty } from '../../lib/api';
import { SITE_NAME } from '../../lib/site';
import { serializeData } from '../../utils/helpers';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 Longest Active Users - ${siteTitle}`,
  description: 'View the top 100 longest continuously active users on CKPool.',
};

export default async function TopLoyaltyPage() {
  const data = await getTopUserLoyalty(100);
  const initialData = {
    data: serializeData(data),
    generatedAt: new Date().toISOString(),
  };

  return (
    <div className="container mx-auto p-4">
      <TopUserLoyaltyClient initialData={initialData} limit={100} />
    </div>
  );
}
