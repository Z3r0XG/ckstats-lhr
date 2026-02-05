import React from 'react';

import TopUserDifficultiesClient from '../../components/TopUserDifficultiesClient';
import { getTopUserDifficulties } from '../../lib/api';
import { SITE_NAME } from '../../lib/site';
import { serializeData } from '../../utils/helpers';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 User Difficulties - ${siteTitle}`,
  description: 'View the top 100 user difficulties on CKPool.',
};

export default async function TopDifficultiesPage() {
  const data = await getTopUserDifficulties(100);
  const initialData = {
    data: serializeData(data),
    generatedAt: new Date().toISOString(),
  };

  return (
    <div className="container mx-auto p-4">
      <TopUserDifficultiesClient initialData={initialData} limit={100} />
    </div>
  );
}
