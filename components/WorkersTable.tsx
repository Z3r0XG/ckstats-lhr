'use client';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';

import { SerializedWorker } from '../lib/types/user';
import {
  formatHashrate,
  formatNumber,
  formatTimeAgo,
  convertHashrate,
  getWorkerUserAgentDisplay,
  compareWorkerUserAgentStrings,
} from '../utils/helpers';

interface WorkersTableProps {
  workers: SerializedWorker[];
  address: string;
}

type SortField = keyof SerializedWorker;
type SortOrder = 'asc' | 'desc';

// Eye icon (visible state)
const EyeIcon = () => (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

// Eye-off icon (hidden state)
const EyeOffIcon = () => (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-1.81m8.48 2.61l3.29 1.81M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const WorkersTable: React.FC<WorkersTableProps> = ({ workers, address }) => {
  const [sortField, setSortField] = useState<SortField>('hashrate5m');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [manuallyHiddenIds, setManuallyHiddenIds] = useState<Set<number>>(
    new Set()
  );
  const [autoHideInactive, setAutoHideInactive] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const h = localStorage.getItem('manuallyHiddenWorkers2');
      if (h) setManuallyHiddenIds(new Set(JSON.parse(h) as number[]));
    } catch (err) {
      console.debug('Failed to load manuallyHiddenWorkers2', err);
    }
    try {
      const a = localStorage.getItem('autoHideInactiveWorkers');
      setAutoHideInactive(a === 'true');
    } catch (err) {
      console.debug('Failed to load autoHideInactiveWorkers', err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  const save = (key: string, ids: Set<number>) => {
    if (!storageReady) return;
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(ids)));
    } catch {
      /* ignore */
    }
  };

  const isWorkerIdle = (worker: SerializedWorker): boolean => {
    if (!worker.lastUpdate) return true;
    return (
      Date.now() - new Date(worker.lastUpdate).getTime() > 24 * 60 * 60 * 1000
    );
  };

  const isHidden = (w: SerializedWorker) => {
    if (autoHideInactive) return isWorkerIdle(w);
    return manuallyHiddenIds.has(w.id);
  };

  const toggleWorkerVisibility = (workerId: number) => {
    setManuallyHiddenIds((prev) => {
      const n = new Set(prev);
      if (n.has(workerId)) {
        n.delete(workerId);
      } else {
        n.add(workerId);
      }
      save('manuallyHiddenWorkers2', n);
      return n;
    });
  };

  const toggleAutoHideInactive = () => {
    const newValue = !autoHideInactive;
    setAutoHideInactive(newValue);
    if (storageReady) {
      try {
        localStorage.setItem('autoHideInactiveWorkers', String(newValue));
      } catch {
        /* ignore */
      }
    }
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

  const { visibleWorkers, hiddenWorkers } = sortedWorkers.reduce(
    (acc, w) => {
      (isHidden(w) ? acc.hiddenWorkers : acc.visibleWorkers).push(w);
      return acc;
    },
    {
      visibleWorkers: [] as SerializedWorker[],
      hiddenWorkers: [] as SerializedWorker[],
    }
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  const renderWorkerRow = (worker: SerializedWorker, showEye: boolean) => {
    const parseHashrateToNumber = (raw: any): number => {
      if (raw === undefined || raw === null) return 0;
      if (typeof raw === 'bigint') return Number(raw);
      const s = String(raw).trim();
      if (/^[+-]?\d+$/.test(s)) {
        try {
          const bi = BigInt(s);
          return bi === BigInt(0) ? 0 : Number(s);
        } catch {
          return 0;
        }
      }
      const n = Number(s);
      return Number.isNaN(n) ? 0 : n;
    };
    const hr5mRaw = worker.hashrate5m ?? '0';
    const hr1hrRaw = worker.hashrate1hr ?? '0';
    const hr1dRaw = worker.hashrate1d ?? '0';
    const hr5m = parseHashrateToNumber(hr5mRaw);
    const hr1hr = parseHashrateToNumber(hr1hrRaw);
    const hr1d = parseHashrateToNumber(hr1dRaw);
    const cls5m = hr5m === 0 ? '' : hr5m < 1 ? 'text-error' : 'text-accent';
    const cls1hr = hr1hr === 0 ? '' : hr1hr < 1 ? 'text-error' : '';
    const cls1d = hr1d === 0 ? '' : hr1d < 1 ? 'text-error' : '';
    const renderHr = (raw: any, numeric: number) => {
      const s = raw !== undefined && raw !== null ? String(raw).trim() : '0';
      if (s === '0' || numeric === 0) return '0 H/s';
      return formatHashrate(raw as any, true);
    };
    const startedSec = worker.latestStats?.started
      ? Number(worker.latestStats.started)
      : 0;
    let uptimeEl: React.ReactNode = (
      <span className="text-red-500">Offline</span>
    );
    if (startedSec > 0) {
      const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - startedSec));
      const colorClass = diffSec < 600 ? 'text-warning' : 'text-success';
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s2 = diffSec % 60;
      const parts: string[] = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0 || h > 0) parts.push(`${m}m`);
      parts.push(`${s2}s`);
      uptimeEl = <span className={colorClass}>{parts.join(' ')}</span>;
    }
    return (
      <tr key={worker.id}>
        {!autoHideInactive && (
          <td
            style={{
              padding: '0.75rem 0 0.75rem 1rem',
              width: '1%',
              whiteSpace: 'nowrap',
            }}
          >
            <button
              onClick={
                storageReady
                  ? () => toggleWorkerVisibility(worker.id)
                  : undefined
              }
              disabled={!storageReady}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                lineHeight: 0,
                cursor: storageReady ? 'pointer' : 'default',
                opacity: 0.5,
                color: 'inherit',
              }}
              title={showEye ? 'Hide worker' : 'Show worker'}
              aria-label={showEye ? 'Hide worker' : 'Show worker'}
            >
              {showEye ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </td>
        )}
        <td>
          <Link
            className="link text-primary"
            href={`/users/${encodeURIComponent(address)}/workers/${encodeURIComponent(worker.name)}`}
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
        <td>{formatNumber(worker.shares)}</td>
        <td>{formatNumber(worker.bestShare)}</td>
        <td>{formatNumber(worker.bestEver)}</td>
        <td>{formatTimeAgo(worker.lastUpdate)}</td>
        <td>{uptimeEl}</td>
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr>
        {!autoHideInactive && (
          <th style={{ padding: '0.75rem 0 0.75rem 1rem', width: '1%' }}></th>
        )}
        <th onClick={() => handleSort('name')} className="cursor-pointer">
          Name{renderSortIcon('name')}
        </th>
        <th
          onClick={() => handleSort('userAgentRaw')}
          className="cursor-pointer"
        >
          Client{renderSortIcon('userAgentRaw')}
        </th>
        <th onClick={() => handleSort('hashrate5m')} className="cursor-pointer">
          Hashrate (5m){renderSortIcon('hashrate5m')}
        </th>
        <th
          onClick={() => handleSort('hashrate1hr')}
          className="cursor-pointer"
        >
          Hashrate (1hr){renderSortIcon('hashrate1hr')}
        </th>
        <th onClick={() => handleSort('hashrate1d')} className="cursor-pointer">
          Hashrate (1d){renderSortIcon('hashrate1d')}
        </th>
        <th onClick={() => handleSort('shares')} className="cursor-pointer">
          Total Shares{renderSortIcon('shares')}
        </th>
        <th onClick={() => handleSort('bestShare')} className="cursor-pointer">
          Best Share{renderSortIcon('bestShare')}
        </th>
        <th onClick={() => handleSort('bestEver')} className="cursor-pointer">
          Best Ever{renderSortIcon('bestEver')}
        </th>
        <th onClick={() => handleSort('lastUpdate')} className="cursor-pointer">
          Last Update{renderSortIcon('lastUpdate')}
        </th>
        <th>Uptime</th>
      </tr>
    </thead>
  );

  return (
    <>
      <div className="bg-base-200 p-4 rounded-lg mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            Workers ({visibleWorkers.length})
          </h2>
          {storageReady && (
            <label className="flex items-center gap-3 cursor-pointer">
              <span
                className="text-sm tooltip"
                data-tip="No Activity in 24 hours"
              >
                Auto-Hide Inactive
              </span>
              <input
                type="checkbox"
                checked={autoHideInactive}
                onChange={toggleAutoHideInactive}
                className={`toggle toggle-sm tooltip ${autoHideInactive ? 'toggle-success' : ''}`}
                data-tip="No Activity in 24 hours"
                aria-checked={autoHideInactive}
              />
            </label>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table w-full table-sm sm:table-md whitespace-nowrap">
            {tableHead}
            <tbody>{visibleWorkers.map((w) => renderWorkerRow(w, true))}</tbody>
          </table>
        </div>
      </div>
      {hiddenWorkers.length > 0 && (
        <details className="collapse collapse-arrow bg-base-300 mt-4">
          <summary className="collapse-title text-sm font-medium">
            Hidden ({hiddenWorkers.length})
          </summary>
          <div className="collapse-content">
            <div className="overflow-x-auto mt-4">
              <table className="table w-full table-sm sm:table-md whitespace-nowrap">
                {tableHead}
                <tbody>
                  {hiddenWorkers.map((w) => renderWorkerRow(w, false))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </>
  );
};

export default WorkersTable;
