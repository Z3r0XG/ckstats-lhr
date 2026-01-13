'use client';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';

import { Worker } from '../lib/entities/Worker';
import {
  formatHashrate,
  formatNumber,
  formatTimeAgo,
  convertHashrate,
  getWorkerUserAgentDisplay,
  compareWorkerUserAgentStrings,
} from '../utils/helpers';

interface WorkersTableProps {
  workers: Array<Worker & { latestStats?: { started?: string } }>;
  address?: string;
}

type SortField = keyof Worker;
type SortOrder = 'asc' | 'desc';

const WorkersTable: React.FC<WorkersTableProps> = ({ workers, address }) => {
  const [sortField, setSortField] = useState<SortField>('hashrate5m');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [hideInactive, setHideInactive] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  // Load hideInactive preference from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem('hideInactiveWorkers');
      if (saved !== null) {
        setHideInactive(saved === 'true');
      }
      setStorageReady(true);
    } catch (err) {
      console.debug('localStorage unavailable for hideInactiveWorkers', err);
      setStorageReady(false);
    }
  }, []);

  // Save hideInactive preference to localStorage when it changes
  const handleToggleHideInactive = () => {
    const newValue = !hideInactive;
    setHideInactive(newValue);

    if (!storageReady) return;

    try {
      localStorage.setItem('hideInactiveWorkers', String(newValue));
    } catch (err) {
      console.debug(
        'localStorage unavailable when setting hideInactiveWorkers',
        err
      );
    }
  };

  const isWorkerIdle = (worker: Worker): boolean => {
    if (!worker.lastUpdate) return true;
    const lastUpdateTime = new Date(worker.lastUpdate).getTime();
    const now = Date.now();
    const hours24 = 24 * 60 * 60 * 1000;
    return now - lastUpdateTime > hours24;
  };

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
      if (sortField === 'userAgentRaw') {
        const cmp = compareWorkerUserAgentStrings(
          a.userAgentRaw,
          b.userAgentRaw
        );
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      // bestEver and bestShare are floats, sort numerically (no rounding)
      if (sortField === 'bestEver') {
        const aNum = Number(a.bestEver) || 0;
        const bNum = Number(b.bestEver) || 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (sortField === 'bestShare') {
        const aNum = Number(a.bestShare) || 0;
        const bNum = Number(b.bestShare) || 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
      }

      const numericFields = ['hashrate5m', 'hashrate1hr', 'hashrate1d'];

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

      const aField = a[sortField];
      const bField = b[sortField];
      if (aField == null || bField == null) return 0;
      if (aField < bField) return sortOrder === 'asc' ? -1 : 1;
      if (aField > bField) return sortOrder === 'asc' ? 1 : -1;
    }

    return 0;
  });

  const displayWorkers = hideInactive
    ? sortedWorkers.filter((w) => !isWorkerIdle(w))
    : sortedWorkers;

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="bg-base-200 p-4 rounded-lg mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Workers</h2>
        {storageReady && (
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm">Hide Inactive</span>
            <input
              type="checkbox"
              checked={hideInactive}
              onChange={handleToggleHideInactive}
              className={`toggle toggle-sm ${hideInactive ? 'toggle-success' : ''}`}
              title="Toggle to show/hide workers with no updates in the last 24 hours."
              aria-checked={hideInactive}
            />
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="table w-full table-sm sm:table-md">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="cursor-pointer">
                Name{renderSortIcon('name')}
              </th>
              <th
                onClick={() => handleSort('userAgentRaw')}
                className="cursor-pointer"
              >
                Client{renderSortIcon('userAgentRaw')}
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
              <th className="cursor-pointer">Uptime</th>
            </tr>
          </thead>
          <tbody>
            {displayWorkers.map((worker) => {
              const parseHashrateToNumber = (raw: any): number => {
                if (raw === undefined || raw === null) return 0;
                if (typeof raw === 'bigint') return Number(raw);
                const s = String(raw).trim();
                if (/^[+-]?\d+$/.test(s)) {
                  try {
                    const bi = BigInt(s);
                    return bi === BigInt(0) ? 0 : Number(s);
                  } catch (e) {
                    console.debug(
                      'BigInt conversion failed in parseHashrateToNumber',
                      e
                    );
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
                  <td title={worker.userAgentRaw || ''}>
                    {getWorkerUserAgentDisplay(worker.userAgentRaw)}
                  </td>
                  <td className={cls5m}>{renderHr(hr5mRaw, hr5m)}</td>
                  <td className={cls1hr}>{renderHr(hr1hrRaw, hr1hr)}</td>
                  <td className={cls1d}>{renderHr(hr1dRaw, hr1d)}</td>
                  <td>{formatNumber(worker.bestShare)}</td>
                  <td>{formatNumber(worker.bestEver)}</td>
                  <td>{formatTimeAgo(worker.lastUpdate)}</td>
                  <td>
                    {worker.latestStats &&
                    worker.latestStats.started &&
                    Number(worker.latestStats.started) > 0 ? (
                      (() => {
                        const startedSec = Number(worker.latestStats.started);
                        const nowSec = Date.now() / 1000;
                        const diffSec = Math.max(
                          0,
                          Math.floor(nowSec - startedSec)
                        );
                        // Color: <10m yellow, >=10m green
                        let colorClass = '';
                        if (diffSec < 600) {
                          colorClass = 'text-yellow-500';
                        } else {
                          colorClass = 'text-green-600';
                        }
                        // Format as human readable duration
                        const hours = Math.floor(diffSec / 3600);
                        const minutes = Math.floor((diffSec % 3600) / 60);
                        const seconds = diffSec % 60;
                        const parts: string[] = [];
                        if (hours > 0) parts.push(`${hours}h`);
                        if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
                        parts.push(`${seconds}s`);
                        return (
                          <span className={colorClass}>{parts.join(' ')}</span>
                        );
                      })()
                    ) : (
                      <span className="text-red-500">Offline</span>
                    )}
                  </td>
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
