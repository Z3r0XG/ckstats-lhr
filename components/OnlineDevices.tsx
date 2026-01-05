export const revalidate = 60;

import React from 'react';

import { getOnlineDevices } from '../lib/api';
import { formatHashrate, formatNumber } from '../utils/helpers';

interface OnlineDevicesProps {
  limit?: number;
}

const SMALL_LIMIT = 10;

export default async function OnlineDevices({
  limit = SMALL_LIMIT,
}: OnlineDevicesProps) {
  try {
    const clients = await getOnlineDevices(limit);
    const title = 'Online Devices';

    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">{title}</h2>

          <div className="overflow-x-auto">
            <table className="table w-full table-sm sm:table-md">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Client</th>
                  <th>Active</th>
                  <th>Hashrate</th>
                  <th>Best Diff</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c, index) => (
                  <tr key={`${c.client}-${index}`}>
                    <td>{index + 1}</td>
                    <td className="break-words max-w-[18rem]">
                      {c.client || 'Other'}
                    </td>
                    <td className="text-accent">{c.activeWorkers}</td>
                    <td className="text-accent">
                      {formatHashrate(Number(c.hashrate1hr))}
                    </td>
                    <td className="text-accent">
                      {formatNumber(Number(c.bestEver))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error fetching online devices:', error);
    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">Online Devices</h2>
          <p className="text-error">
            Error loading online devices. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}
