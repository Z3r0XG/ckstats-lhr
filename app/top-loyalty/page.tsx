export const revalidate = 60;

import React from 'react';

import TopUserLoyalty from '../../components/TopUserLoyalty';
import { SITE_NAME } from '../../lib/site';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 Longest Active Users - ${siteTitle}`,
  description: 'View the top 100 longest continuously active users on CKPool.',
};

export default function TopLoyaltyPage() {
  return (
    <div className="container mx-auto p-4">
      <TopUserLoyalty limit={100} />
    </div>
  );
}
