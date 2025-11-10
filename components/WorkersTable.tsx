'use client';

import React, { useState } from 'react';

import Link from 'next/link';

import { Worker } from '../lib/entities/Worker';
import {
  formatHashrate,
  formatNumber,
  formatTimeAgo,
  convertHashrate,
} from '../utils/helpers';

interface WorkersTableProps {
  workers: Worker[];
  address?: string;
}

type SortField = keyof Worker;
type SortOrder = 'asc' | 'desc';

const WorkersTable: React.FC<WorkersTableProps> = ({ workers, address }) => {
  const [sortField, setSortField] = useState<SortField>('hashrate5m');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedWorkers = [...workers].sort((a, b) => {
    if (sortField) {
      const numericFields = [
        'hashrate5m',
        'hashrate1hr',
        'hashrate1d',
        'bestEver',
      ];

      if (numericFields.includes(sortField)) {
        const toBigIntSafe = (v: any): bigint => {
          const s = String(v ?? '0').trim();
          if (/^[+-]?\d+$/.test(s)) {
            try {
              return BigInt(s);
            } catch {
              return BigInt(0);
            }
          }

          if ((sortField as string).startsWith('hashrate')) {
            try {
              return convertHashrate(s);
            } catch {
              return BigInt(0);
            }
          }

          const n = Number(s);
          if (Number.isNaN(n)) return BigInt(0);
          return BigInt(Math.round(n));
        };

        const aVal = toBigIntSafe(a[sortField]);
        const bVal = toBigIntSafe(b[sortField]);
        return sortOrder === 'asc' ? Number(aVal - bVal) : Number(bVal - aVal);
      }

      if (a[sortField] < b[sortField]) return sortOrder === 'asc' ? -1 : 1;
      if (a[sortField] > b[sortField]) return sortOrder === 'asc' ? 1 : -1;
    }

    return 0;
  });

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="bg-base-200 p-4 rounded-lg mt-8">
      <h2 className="text-xl font-bold mb-4">Workers</h2>
      <div className="overflow-x-auto">
        <table className="table w-full table-sm sm:table-md">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="cursor-pointer">
                Name{renderSortIcon('name')}
              </th>
              <th
                onClick={() => handleSort('hashrate5m')}
                className="cursor-pointer"
              >
                Hashrate (5m){renderSortIcon('hashrate5m')}
              </th>
              <th
                onClick={() => handleSort('hashrate1hr')}
                className="cursor-pointer"
              >
                Hashrate (1hr){renderSortIcon('hashrate1hr')}
              </th>
              <th
                onClick={() => handleSort('hashrate1d')}
                className="cursor-pointer"
              >
                Hashrate (1d){renderSortIcon('hashrate1d')}
              </th>
              <th
                onClick={() => handleSort('bestShare')}
                className="cursor-pointer"
              >
                Best Share{renderSortIcon('bestShare')}
              </th>
              <th
                onClick={() => handleSort('bestEver')}
                className="cursor-pointer"
              >
                Best Ever{renderSortIcon('bestEver')}
              </th>
              <th
                onClick={() => handleSort('lastUpdate')}
                className="cursor-pointer"
              >
                Last Update{renderSortIcon('lastUpdate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedWorkers.map((worker) => {
              const parseHashrateToNumber = (raw: any): number => {
                if (raw === undefined || raw === null) return 0;
                if (typeof raw === 'bigint') return Number(raw);
                const s = String(raw).trim();
                if (/^[+-]?\d+$/.test(s)) {
                  try {
                    const bi = BigInt(s);
                    return bi === BigInt(0) ? 0 : Number(s);
                  } catch {
                    // fallthrough
                  }
                }
                const n = Number(s);
                if (Number.isNaN(n)) return 0;
                return n;
              };

              const hr5mRaw = worker.hashrate5m ?? '0';
              const hr1hrRaw = worker.hashrate1hr ?? '0';
              const hr1dRaw = worker.hashrate1d ?? '0';

              const hr5m = parseHashrateToNumber(hr5mRaw);
              const hr1hr = parseHashrateToNumber(hr1hrRaw);
              const hr1d = parseHashrateToNumber(hr1dRaw);

              let cls5m = '';
              if (hr5m === 0) {
                cls5m = '';
              } else if (hr5m < 1) {
                cls5m = 'text-error';
              } else {
                cls5m = 'text-accent';
              }

              let cls1hr = '';
              if (hr1hr === 0) {
                cls1hr = '';
              } else if (hr1hr < 1) {
                cls1hr = 'text-error';
              } else {
                cls1hr = '';
              }

              let cls1d = '';
              if (hr1d === 0) {
                cls1d = '';
              } else if (hr1d < 1) {
                cls1d = 'text-error';
              } else {
                cls1d = '';
              }

              const renderHr = (raw: any, numeric: number) => {
                let s = '0';
                if (raw !== undefined && raw !== null) s = String(raw).trim();
                if (s === '0' || numeric === 0) return '0 H/s';
                return formatHashrate(raw as any, true);
              };

              return (
                <tr key={worker.id}>
                  <td>
                    <Link
                      className="link text-primary"
                      href={`/users/${address}/workers/${encodeURIComponent(
                        worker.name
                      )}`}
                    >
                      {worker.name || <span className="italic">Unnamed</span>}
                    </Link>
                  </td>
                  <td className={cls5m}>{renderHr(hr5mRaw, hr5m)}</td>
                  <td className={cls1hr}>{renderHr(hr1hrRaw, hr1hr)}</td>
                  <td className={cls1d}>{renderHr(hr1dRaw, hr1d)}</td>
                  <td>{formatNumber(worker.bestShare)}</td>
                  <td>{formatNumber(worker.bestEver)}</td>
                  <td>{formatTimeAgo(worker.lastUpdate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkersTable;
