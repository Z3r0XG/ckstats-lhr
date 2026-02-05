import React from 'react';

import TopUserHashratesClient from '../../components/TopUserHashratesClient';
import { getTopUserHashrates } from '../../lib/api';
import { SITE_NAME } from '../../lib/site';
import { serializeData } from '../../utils/helpers';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 User Hashrates - ${siteTitle}`,
  description: 'View the top 100 user hashrates on CKPool.',
};

export default async function TopHashratesPage() {
  const data = await getTopUserHashrates(100);
  const initialData = {
    data: serializeData(data),
    generatedAt: new Date().toISOString(),
  };

  return (
    <div className="container mx-auto p-4">
      <TopUserHashratesClient initialData={initialData} limit={100} />
    </div>
  );
}
