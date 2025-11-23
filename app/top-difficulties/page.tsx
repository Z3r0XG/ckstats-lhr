export const revalidate = 60;

import React from 'react';

import TopUserDifficulties from '../../components/TopUserDifficulties';
import { SITE_NAME } from '../../lib/site';

const siteTitle = SITE_NAME;

export const metadata = {
  title: `Top 100 User Difficulties - ${siteTitle}`,
  description: 'View the top 100 user difficulties on CKPool.',
};

export default function TopDifficultiesPage() {
  return (
    <div className="container mx-auto p-4">
      <TopUserDifficulties limit={100} />
    </div>
  );
}
