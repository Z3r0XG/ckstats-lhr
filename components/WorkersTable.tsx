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
} from '../utils/helpers';
import { isVisible, anyVisible } from '../utils/visibility';
import { isWorkerIdle } from '../utils/workerActivity';

interface WorkersTableProps {
  workers: SerializedWorker[];
  address: string;
}

type SortField = keyof SerializedWorker | 'uptime';
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

// Case-insensitive, natural-numeric compare — used for every text sort field so "N"/"n"
// interleave and "worker2" sorts before "worker10".
const compareText = (x?: string | null, y?: string | null) =>
  String(x ?? '').localeCompare(String(y ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });

const WorkersTable: React.FC<WorkersTableProps> = ({ workers, address }) => {
  const [sortField, setSortField] = useState<SortField>('hashrate5m');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [manuallyHiddenIds, setManuallyHiddenIds] = useState<Set<number>>(
    new Set()
  );
  const [autoHideInactive, setAutoHideInactive] = useState(false);
  // Client column: full raw UA (default) vs our normalized token. Pure display switch — both are
  // stored on the worker (userAgentRaw / userAgent). Persisted like the autohide toggle.
  const [showFullClient, setShowFullClient] = useState(true);
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
    }
    try {
      const sf = localStorage.getItem('workerSortField');
      if (sf) setSortField(sf as SortField);
      const so = localStorage.getItem('workerSortOrder');
      if (so === 'asc' || so === 'desc') setSortOrder(so);
    } catch (err) {
      console.debug('Failed to load worker sort', err);
    }
    try {
      const f = localStorage.getItem('showFullClientWorkers');
      if (f !== null) setShowFullClient(f === 'true'); // default stays true
    } catch (err) {
      console.debug('Failed to load showFullClientWorkers', err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  // Persist sort field + direction like the other worker-table prefs.
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem('workerSortField', sortField);
      localStorage.setItem('workerSortOrder', sortOrder);
    } catch {
      /* ignore */
    }
  }, [sortField, sortOrder, storageReady]);

  const save = (key: string, ids: Set<number>) => {
    if (!storageReady) return;
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(ids)));
    } catch {
      /* ignore */
    }
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

  const toggleShowFullClient = () => {
    const newValue = !showFullClient;
    setShowFullClient(newValue);
    if (storageReady) {
      try {
        localStorage.setItem('showFullClientWorkers', String(newValue));
      } catch {
        /* ignore */
      }
    }
  };

  const sortedWorkers = [...workers].sort((a, b) => {
    if (sortField) {
      // 'uptime' is derived from latestStats.started (not a worker field): longer uptime = earlier
      // start; offline (no start) sorts to the bottom on desc.
      if (sortField === 'uptime') {
        const up = (w: SerializedWorker) => {
          const s = w.latestStats?.started ? Number(w.latestStats.started) : 0;
          return s > 0 ? Date.now() / 1000 - s : -1;
        };
        return sortOrder === 'asc' ? up(a) - up(b) : up(b) - up(a);
      }
      // Text fields share one case-insensitive, natural-numeric comparator.
      if (sortField === 'name' || sortField === 'userAgentRaw') {
        const cmp = compareText(a[sortField], b[sortField]);
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

        const aVal = toBigIntSafe(a[sortField as keyof SerializedWorker]);
        const bVal = toBigIntSafe(b[sortField as keyof SerializedWorker]);
        return sortOrder === 'asc' ? Number(aVal - bVal) : Number(bVal - aVal);
      }

      const aField = a[sortField as keyof SerializedWorker];
      const bField = b[sortField as keyof SerializedWorker];
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

  // Per-worker derived display values, shared by the desktop row and the mobile card so the two
  // never drift apart.
  const deriveWorker = (worker: SerializedWorker) => {
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
    // raw hashrate → display cell; `accent` tints the 5m column (1hr/1d stay untinted, per the original).
    const hrCell = (raw: string | number, accent: boolean) => {
      const n = parseHashrateToNumber(raw);
      const className =
        n === 0 ? '' : n < 1 ? 'text-error' : accent ? 'text-accent' : '';
      const value =
        String(raw ?? '0').trim() === '0' || n === 0
          ? '0 H/s'
          : formatHashrate(raw, true);
      return { className, value };
    };
    const c5m = hrCell(worker.hashrate5m ?? '0', true);
    const c1hr = hrCell(worker.hashrate1hr ?? '0', false);
    const c1d = hrCell(worker.hashrate1d ?? '0', false);
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
    const client = showFullClient
      ? getWorkerUserAgentDisplay(worker.userAgentRaw)
      : getWorkerUserAgentDisplay(worker.userAgent);
    return { c5m, c1hr, c1d, uptimeEl, client };
  };

  const renderEyeButton = (worker: SerializedWorker, showEye: boolean) => (
    <button
      onClick={
        storageReady ? () => toggleWorkerVisibility(worker.id) : undefined
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
  );

  const renderWorkerRow = (worker: SerializedWorker, showEye: boolean) => {
    const { c5m, c1hr, c1d, uptimeEl, client } = deriveWorker(worker);
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
            {renderEyeButton(worker, showEye)}
          </td>
        )}
        {isVisible('worker.table.name') && (
          <td>
            <Link
              className="link text-primary"
              href={`/users/${encodeURIComponent(address)}/workers/${encodeURIComponent(worker.name)}`}
            >
              {worker.name || <span className="italic">Unnamed</span>}
            </Link>
          </td>
        )}
        {isVisible('worker.table.client') && (
          <td
            title={worker.userAgentRaw || ''}
            className={
              showFullClient
                ? 'max-w-[20rem] whitespace-normal break-words'
                : ''
            }
          >
            {client}
          </td>
        )}
        {isVisible('worker.table.hashrate') && (
          <td className={c5m.className}>{c5m.value}</td>
        )}
        {isVisible('worker.table.hashrate1hr') && (
          <td className={c1hr.className}>{c1hr.value}</td>
        )}
        {isVisible('worker.table.hashrate1d') && (
          <td className={c1d.className}>{c1d.value}</td>
        )}
        {isVisible('worker.table.accepted') && (
          <td>{formatNumber(worker.shares)}</td>
        )}
        {isVisible('worker.table.bestdiff') && (
          <td>{formatNumber(worker.bestShare)}</td>
        )}
        {isVisible('worker.table.bestever') && (
          <td>{formatNumber(worker.bestEver)}</td>
        )}
        {isVisible('worker.table.lastshare') && (
          <td>{formatTimeAgo(worker.lastUpdate)}</td>
        )}
        {isVisible('worker.table.uptime') && <td>{uptimeEl}</td>}
      </tr>
    );
  };

  // Mobile (<sm): each worker as a self-contained card instead of a scrolling row.
  const renderWorkerCard = (worker: SerializedWorker, showEye: boolean) => {
    const { c5m, c1hr, c1d, uptimeEl, client } = deriveWorker(worker);
    // Each stat is a label-left / value-right row (the name is the card header + hide toggle).
    const statRow = (label: string, value: React.ReactNode, key: string) => (
      <div
        key={key}
        className="flex items-baseline justify-between gap-2 text-sm"
      >
        <span className="shrink-0 text-base-content/60">{label}</span>
        <span className="min-w-0 break-words text-right">{value}</span>
      </div>
    );
    return (
      <li
        key={worker.id}
        className="rounded-box border border-base-content/10 bg-base-100 p-3 space-y-1.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          {isVisible('worker.table.name') ? (
            <Link
              className="link text-primary min-w-0 truncate pr-1 text-base font-semibold"
              href={`/users/${encodeURIComponent(address)}/workers/${encodeURIComponent(worker.name)}`}
            >
              {worker.name || <span className="italic">Unnamed</span>}
            </Link>
          ) : (
            <span />
          )}
          {!autoHideInactive && renderEyeButton(worker, showEye)}
        </div>
        {isVisible('worker.table.client') &&
          statRow(
            'client',
            <span title={worker.userAgentRaw || ''}>{client}</span>,
            'client'
          )}
        {isVisible('worker.table.hashrate') &&
          statRow(
            'hashrate (5m)',
            <span className={`font-semibold ${c5m.className}`}>
              {c5m.value}
            </span>,
            'hr'
          )}
        {isVisible('worker.table.hashrate1hr') &&
          statRow(
            'hashrate (1hr)',
            <span className={`font-semibold ${c1hr.className}`}>
              {c1hr.value}
            </span>,
            'hr1hr'
          )}
        {isVisible('worker.table.hashrate1d') &&
          statRow(
            'hashrate (1d)',
            <span className={`font-semibold ${c1d.className}`}>
              {c1d.value}
            </span>,
            'hr1d'
          )}
        {isVisible('worker.table.accepted') &&
          statRow(
            'accepted work',
            <span className="font-semibold">
              {formatNumber(worker.shares)}
            </span>,
            'accepted'
          )}
        {isVisible('worker.table.bestdiff') &&
          statRow(
            'best diff',
            <span className="font-semibold">
              {formatNumber(worker.bestShare)}
            </span>,
            'best'
          )}
        {isVisible('worker.table.bestever') &&
          statRow(
            'best ever',
            <span className="font-semibold">
              {formatNumber(worker.bestEver)}
            </span>,
            'bestever'
          )}
        {isVisible('worker.table.lastshare') &&
          statRow('last share', formatTimeAgo(worker.lastUpdate), 'lastshare')}
        {isVisible('worker.table.uptime') &&
          statRow('uptime', uptimeEl, 'uptime')}
      </li>
    );
  };

  const tableHead = (
    <thead>
      <tr>
        {!autoHideInactive && (
          <th style={{ padding: '0.75rem 0 0.75rem 1rem', width: '1%' }}></th>
        )}
        {isVisible('worker.table.name') && <th>Name</th>}
        {isVisible('worker.table.client') && <th>Client</th>}
        {isVisible('worker.table.hashrate') && <th>Hashrate (5m)</th>}
        {isVisible('worker.table.hashrate1hr') && <th>Hashrate (1hr)</th>}
        {isVisible('worker.table.hashrate1d') && <th>Hashrate (1d)</th>}
        {isVisible('worker.table.accepted') && <th>Accepted Work</th>}
        {isVisible('worker.table.bestdiff') && <th>Best Diff</th>}
        {isVisible('worker.table.bestever') && <th>Best Ever</th>}
        {isVisible('worker.table.lastshare') && <th>Last Share</th>}
        {isVisible('worker.table.uptime') && <th>Uptime</th>}
      </tr>
    </thead>
  );

  const tableVisible = anyVisible([
    'worker.table.name',
    'worker.table.client',
    'worker.table.hashrate',
    'worker.table.hashrate1hr',
    'worker.table.hashrate1d',
    'worker.table.accepted',
    'worker.table.bestdiff',
    'worker.table.bestever',
    'worker.table.lastshare',
    'worker.table.uptime',
  ]);

  // Single sort UI for both breakpoints (the mobile cards have no clickable headers): a field
  // dropdown + a direction toggle, driving the same sort state the table uses.
  const sortOptions = (
    [
      { field: 'name', label: 'Name', flag: 'worker.table.name' },
      { field: 'userAgentRaw', label: 'Client', flag: 'worker.table.client' },
      {
        field: 'hashrate5m',
        label: 'Hashrate (5m)',
        flag: 'worker.table.hashrate',
      },
      {
        field: 'hashrate1hr',
        label: 'Hashrate (1hr)',
        flag: 'worker.table.hashrate1hr',
      },
      {
        field: 'hashrate1d',
        label: 'Hashrate (1d)',
        flag: 'worker.table.hashrate1d',
      },
      {
        field: 'shares',
        label: 'Accepted Work',
        flag: 'worker.table.accepted',
      },
      { field: 'bestShare', label: 'Best Diff', flag: 'worker.table.bestdiff' },
      {
        field: 'bestEver',
        label: 'Best Ever',
        flag: 'worker.table.bestever',
      },
      {
        field: 'lastUpdate',
        label: 'Last Share',
        flag: 'worker.table.lastshare',
      },
      { field: 'uptime', label: 'Uptime', flag: 'worker.table.uptime' },
    ] as { field: SortField; label: string; flag: string }[]
  ).filter((o) => isVisible(o.flag));

  // Pick a field; re-picking the current field flips direction (like click-to-sort headers).
  const handleSortPick = (field: SortField) => {
    if (field === sortField) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    // close the focus-based dropdown
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  };

  const arrow = sortOrder === 'asc' ? '▲' : '▼';
  const currentLabel =
    sortOptions.find((o) => o.field === sortField)?.label ?? 'Sort';

  const sortControl = (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm sm:inline">Sort</span>
      <div className="dropdown dropdown-end">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-sm btn-outline gap-1 font-normal"
          aria-label={`Sort by ${currentLabel}, ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
        >
          {currentLabel}
          <span aria-hidden="true">{arrow}</span>
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content menu z-10 mt-1 w-52 rounded-box border border-base-content/10 bg-base-100 p-1 shadow"
        >
          {sortOptions.map((o) => (
            <li key={o.field}>
              <button
                type="button"
                onClick={() => handleSortPick(o.field)}
                className={`flex justify-between ${o.field === sortField ? 'active' : ''}`}
              >
                <span>{o.label}</span>
                {o.field === sortField && (
                  <span aria-hidden="true">{arrow}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      {tableVisible && (
        <div className="bg-base-200 p-4 rounded-lg mt-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <h2 className="text-xl font-bold whitespace-nowrap">
                Workers ({visibleWorkers.length})
              </h2>
              {/* mobile: sort rides on the Workers row */}
              {sortOptions.length > 0 && (
                <div className="sm:hidden">{sortControl}</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {storageReady && (
                <>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <span
                      className="text-sm tooltip"
                      data-tip="Show the full client string instead of the simplified device name"
                    >
                      Full Client
                    </span>
                    <input
                      type="checkbox"
                      checked={showFullClient}
                      onChange={toggleShowFullClient}
                      className={`toggle toggle-sm tooltip ${showFullClient ? 'toggle-success' : ''}`}
                      data-tip="Show the full client string instead of the simplified device name"
                      aria-checked={showFullClient}
                    />
                  </label>
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
                </>
              )}
              {sortOptions.length > 0 && (
                <div className="hidden sm:block">{sortControl}</div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto hidden sm:block">
            <table className="table w-full table-sm sm:table-md whitespace-nowrap">
              {tableHead}
              <tbody>
                {visibleWorkers.map((w) => renderWorkerRow(w, true))}
              </tbody>
            </table>
          </div>
          <ul className="sm:hidden space-y-2">
            {visibleWorkers.map((w) => renderWorkerCard(w, true))}
          </ul>
        </div>
      )}
      {tableVisible && hiddenWorkers.length > 0 && (
        <details className="collapse collapse-arrow bg-base-300 mt-4">
          <summary className="collapse-title text-sm font-medium">
            Hidden ({hiddenWorkers.length})
          </summary>
          <div className="collapse-content min-w-0">
            <div className="overflow-x-auto mt-4 hidden sm:block">
              <table className="table w-full table-sm sm:table-md whitespace-nowrap">
                {tableHead}
                <tbody>
                  {hiddenWorkers.map((w) => renderWorkerRow(w, false))}
                </tbody>
              </table>
            </div>
            <ul className="sm:hidden space-y-2 mt-4">
              {hiddenWorkers.map((w) => renderWorkerCard(w, false))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
};

export default WorkersTable;
