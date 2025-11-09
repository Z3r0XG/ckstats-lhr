import React from 'react';
import { convertHashrate, formatHashrate } from '../utils/helpers';

interface Worker {
  id?: number | string;
  name: string;
  ip?: string;
  hashrate?: string | number | bigint;
  reportedAt?: string;
  hashrate5m?: string | number | bigint;
  hashrate1hr?: string | number | bigint;
  hashrate1d?: string | number | bigint;
  bestShare?: number | string;
  bestEver?: number | string;
  lastUpdate?: string | Date;
}

interface Props {
  workers: Worker[];
  address?: string;
}

export default function WorkersTable({ workers, address }: Props) {
  const rows = workers.map((w) => {
    const hrBigInt = (() => {
      try {
        if (typeof w.hashrate === 'bigint') return w.hashrate as bigint;
        if (typeof w.hashrate === 'number') return BigInt(Math.floor(w.hashrate));
        if (typeof w.hashrate === 'string') return convertHashrate(w.hashrate);
        return BigInt(0);
      } catch (e) {
        return BigInt(0);
      }
    })();

    return {
      id: w.id,
      name: w.name,
      ip: w.ip,
      hashrate: hrBigInt,
      hashrateDisplay: formatHashrate(Number(hrBigInt), true),
      reportedAt: w.reportedAt,
      hashrate5m: w.hashrate5m,
      hashrate1hr: w.hashrate1hr,
      hashrate1d: w.hashrate1d,
      bestShare: w.bestShare,
      bestEver: w.bestEver,
      lastUpdate: w.lastUpdate,
    };
  });

  rows.sort((a, b) => Number(b.hashrate - a.hashrate));

  return (
    <div className="overflow-auto">
      <table className="table w-full">
        <thead>
          <tr>
            <th>Worker</th>
            <th>IP</th>
            <th>Hashrate</th>
            <th>Reported</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.name}-${r.ip}`}>
              <td>{r.name}</td>
              <td>{r.ip}</td>
              <td>{r.hashrateDisplay}</td>
              <td>{r.reportedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
