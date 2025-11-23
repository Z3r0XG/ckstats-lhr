export const revalidate = 60;

import React from 'react';

import TopUserHashrates from '../../components/TopUserHashrates';
import { SITE_NAME } from '../../lib/site';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 User Hashrates - ${siteTitle}`,
  description: 'View the top 100 user hashrates on CKPool.',
};

export default function TopHashratesPage() {
  return (
    <div className="container mx-auto p-4">
      <TopUserHashrates limit={100} />
    </div>
  );
}
