export const revalidate = 60;

import React from 'react';

import Link from 'next/link';

import { getTopUserLoyalty } from '../lib/api';
import {
  formatConciseTimeAgo,
  formatHashrate,
  formatNumber,
} from '../utils/helpers';

interface TopUserLoyaltyProps {
  limit?: number;
}

const SMALL_LIMIT = 10;

export default async function TopUserLoyalty({
  limit = SMALL_LIMIT,
}: TopUserLoyaltyProps) {
  try {
    const loyals = await getTopUserLoyalty(limit);

    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">
            {limit > SMALL_LIMIT ? (
              `Top ${limit} Longest Active Users`
            ) : (
              <Link href="/top-loyalty" className="link text-primary">
                Top {limit} Longest Active Users
              </Link>
            )}
          </h2>
          <div className="overflow-x-auto">
            <table className="table w-full table-sm sm:table-md">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Address</th>
                  <th>Active Workers</th>
                  <th>Hashrate 1hr</th>
                  <th>Shares Accepted</th>
                  <th>Best Diff</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {loyals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center text-sm text-base-content/60"
                    >
                      No Stats Available Yet
                    </td>
                  </tr>
                ) : (
                  loyals.map((u, i) => {
                    const when = u.authorised
                      ? new Date(u.authorised * 1000)
                      : null;
                    return (
                      <tr key={u.address}>
                        <td className="whitespace-nowrap">{i + 1}</td>
                        <td className="whitespace-nowrap">
                          {u.address.slice(0, 6)}...{u.address.slice(-4)}
                        </td>
                        <td className="text-accent whitespace-nowrap">
                          {u.workerCount}
                        </td>
                        <td className="text-accent whitespace-nowrap">
                          {formatHashrate(u.hashrate1hr)}
                        </td>
                        <td className="text-accent whitespace-nowrap">
                          {formatNumber(u.shares)}
                        </td>
                        <td className="text-accent whitespace-nowrap">
                          {formatNumber(u.bestShare)}
                        </td>
                        <td className="text-sm text-base-content/60 whitespace-nowrap">
                          {when ? formatConciseTimeAgo(when) : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error fetching top user loyalty:', error);
    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">Top {limit} Longest Active Users</h2>
          <p className="text-error">
            Error loading data. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}
