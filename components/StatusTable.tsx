'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { PoolHealth } from '../lib/poolHealth';
import {
  formatDuration,
  formatHashrate,
  formatNumber,
  formatTimeAgo,
} from '../utils/helpers';

type SortDir = 'asc' | 'desc';

interface Column {
  key: string;
  header: string;
  numeric: boolean; // right-aligned + sorts descending on first click
  sortVal: (p: PoolHealth) => number | string;
  cell: (p: PoolHealth) => ReactNode;
}

// Sortable per-pool status table. Pools arrive in Map insertion order (non-deterministic), so the
// default sort (Pool A→Z) makes the order stable and identical across instances; clicking any header
// re-sorts. Status + Last Update are the stats-meta columns; the rest are ckpool metrics.
export default function StatusTable({
  pools,
  showRejected,
  showShareCounts,
  staleMs,
}: {
  pools: PoolHealth[];
  showRejected: boolean;
  showShareCounts: boolean;
  staleMs: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
    key: 'label',
    dir: 'asc',
  });

  // Alive = ckpool runtime advanced within the staleness window (miner-independent).
  const now = Date.now();
  const alive = (p: PoolHealth) =>
    p.lastRuntimeAdvance != null && now - p.lastRuntimeAdvance < staleMs;

  const columns: Column[] = [
    {
      key: 'label',
      header: 'Pool',
      numeric: false,
      sortVal: (p) => p.label.toLowerCase(),
      cell: (p) => <span className="font-medium">{p.label}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      numeric: false,
      sortVal: (p) => (alive(p) ? 1 : 0),
      cell: (p) => (
        <span className={alive(p) ? 'text-success' : 'text-error'}>
          {alive(p) ? 'Up' : 'Down'}
        </span>
      ),
    },
    {
      // Our last successful fetch (ckstats-meta freshness).
      key: 'lastUpdate',
      header: 'Stats Update',
      numeric: false,
      sortVal: (p) => p.lastUpdate ?? 0,
      cell: (p) =>
        p.lastUpdate ? formatTimeAgo(new Date(p.lastUpdate)) : 'never',
    },
    {
      // The pool's own self-reported update time (pool-side freshness).
      key: 'poolLastUpdate',
      header: 'Pool Update',
      numeric: false,
      sortVal: (p) => p.poolLastUpdate ?? 0,
      cell: (p) =>
        p.poolLastUpdate ? formatTimeAgo(new Date(p.poolLastUpdate)) : 'never',
    },
    {
      key: 'uptime',
      header: 'Uptime',
      numeric: false,
      sortVal: (p) => p.uptimeSeconds,
      cell: (p) => (p.uptimeSeconds ? formatDuration(p.uptimeSeconds) : '—'),
    },
    {
      key: 'users',
      header: 'Users',
      numeric: true,
      sortVal: (p) => p.users,
      cell: (p) => formatNumber(p.users),
    },
    {
      key: 'workers',
      header: 'Workers',
      numeric: true,
      sortVal: (p) => p.workers,
      cell: (p) => formatNumber(p.workers),
    },
    {
      key: 'hashrate5m',
      header: 'Hashrate (5m)',
      numeric: true,
      sortVal: (p) => p.hashrate5m,
      cell: (p) => formatHashrate(p.hashrate5m),
    },
    {
      key: 'sps5m',
      header: 'SPS (5m)',
      numeric: true,
      sortVal: (p) => p.sps5m,
      cell: (p) => formatNumber(p.sps5m),
    },
    {
      key: 'acceptedTotal',
      header: 'Accepted Work',
      numeric: true,
      sortVal: (p) => p.acceptedTotal,
      cell: (p) => formatNumber(p.acceptedTotal),
    },
    ...(showRejected
      ? [
          {
            key: 'rejectedTotal',
            header: 'Rejected Work',
            numeric: true,
            sortVal: (p: PoolHealth) => p.rejectedTotal,
            cell: (p: PoolHealth) => formatNumber(p.rejectedTotal),
          },
        ]
      : []),
    ...(showShareCounts
      ? [
          {
            // Share counts (not difficulty) — "Shares" suffix keeps them distinct from the
            // Accepted/Rejected Work (difficulty) columns above.
            key: 'acceptedCount',
            header: 'Accepted Shares',
            numeric: true,
            sortVal: (p: PoolHealth) => p.acceptedCount,
            cell: (p: PoolHealth) => formatNumber(p.acceptedCount),
          },
          {
            key: 'rejectedCount',
            header: 'Rejected Shares',
            numeric: true,
            sortVal: (p: PoolHealth) => p.rejectedCount,
            cell: (p: PoolHealth) => formatNumber(p.rejectedCount),
          },
        ]
      : []),
    {
      key: 'bestShare',
      header: 'Best Diff',
      numeric: true,
      sortVal: (p) => p.bestShare,
      cell: (p) => formatNumber(p.bestShare),
    },
  ];

  const activeCol = columns.find((c) => c.key === sort.key) ?? columns[0];
  const sorted = [...pools].sort((a, b) => {
    const va = activeCol.sortVal(a);
    const vb = activeCol.sortVal(b);
    const r =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
    return sort.dir === 'asc' ? r : -r;
  });

  const onSort = (c: Column) =>
    setSort((s) =>
      s.key === c.key
        ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key: c.key, dir: c.numeric ? 'desc' : 'asc' }
    );

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm sm:table-md w-full">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`cursor-pointer select-none whitespace-nowrap ${c.numeric ? 'text-right' : ''}`}
                onClick={() => onSort(c)}
              >
                {c.header}
                {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.pool}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap ${c.numeric ? 'text-right' : ''}`}
                >
                  {c.cell(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
