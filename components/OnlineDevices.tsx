export const revalidate = 60;

import React from 'react';

import { getOnlineDevicesFromTable, getOnlineDevices } from '../lib/api';
import { formatHashrate, formatNumber } from '../utils/helpers';

interface OnlineDevicesProps {
  limit?: number;
  windowMinutes?: number;
  onlyActive?: boolean;
}

const SMALL_LIMIT = 10;

export default async function OnlineDevices({
  limit = SMALL_LIMIT,
  windowMinutes = 60,
  onlyActive = true,
}: OnlineDevicesProps) {
  try {
    let rows;
    if (onlyActive) {
      rows = await getOnlineDevices(limit, { windowMinutes });
    } else {
      rows = await getOnlineDevicesFromTable(limit, windowMinutes);
    }

    const clients = rows;

    let title = '';
    if (onlyActive) {
      title = 'Online Devices';
    } else if (limit > SMALL_LIMIT) {
      title = `Top ${limit} Clients by Hashrate`;
    } else {
      title = `Top ${limit} Clients`;
    }

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
                  {onlyActive ? (
                    <>
                      <th>Working Now</th>
                      <th>Total Hash Rate</th>
                      <th>Best Difficulty</th>
                    </>
                  ) : (
                    <>
                      <th>Currently Working</th>
                      <th>Total Hash Rate</th>
                      <th>Best Difficulty</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, index) => (
                  <tr key={`${c.client}-${index}`}>
                    <td>{c.rank ?? index + 1}</td>
                    <td className="break-words max-w-[18rem]">{c.client}</td>

                    <>
                      <td>{c.activeWorkers}</td>
                      <td className="text-accent">
                        {formatHashrate(Number(c.hashrate1hr))}
                      </td>
                      <td>{formatNumber(Number(c.bestEver))}</td>
                    </>
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
