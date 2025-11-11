'use client';

import React, { useState, useMemo } from 'react';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LegendType,
  Brush,
} from 'recharts';

import { UserStats } from '../lib/entities/UserStats';
import { WorkerStats } from '../lib/entities/WorkerStats';
import { convertHashrate, toNumberSafe } from '../utils/helpers';

// Add this function at the top of the file, outside the component
function getHashrateUnit(maxHashrate: number): [string, number] {
  if (maxHashrate >= 1e16) return ['PH/s', 1e15];
  if (maxHashrate >= 1e13) return ['TH/s', 1e12];
  if (maxHashrate >= 1e10) return ['GH/s', 1e9];
  if (maxHashrate >= 1e7) return ['MH/s', 1e6];
  if (maxHashrate >= 1e4) return ['kH/s', 1e3];
  return ['H/s', 1];
}

interface UserStatsChartsProps {
  userStats: (UserStats | WorkerStats)[];
}

export default function UserStatsCharts({ userStats }: UserStatsChartsProps) {
  const [hashrateUnit, setHashrateUnit] = useState<string>('PH/s');

  const chartData = useMemo(() => {
    // use central toNumberSafe

    // convert to numeric timestamp, sort ascending
    const sorted = [...userStats]
      .map((stat) => ({ ...stat, timestampMs: new Date(stat.timestamp).getTime() }))
      .sort((a, b) => a.timestampMs - b.timestampMs);

    // compute max using BigInt-aware convertHashrate
    const maxBig = sorted
      .flatMap((stat) => [stat.hashrate1m, stat.hashrate5m, stat.hashrate1hr, stat.hashrate1d, stat.hashrate7d])
      .map((v) => {
        try {
          return convertHashrate(v ?? '0');
        } catch {
          return BigInt(0);
        }
      })
      .reduce((acc, cur) => (cur > acc ? cur : acc), BigInt(0));

    const THRESHOLDS: { threshold: bigint; unit: string; divisor: number }[] = [
      { threshold: BigInt('1000000000000000000000'), unit: 'Z', divisor: 1e21 },
      { threshold: BigInt('1000000000000000000'), unit: 'E', divisor: 1e18 },
      { threshold: BigInt('1000000000000000'), unit: 'P', divisor: 1e15 },
      { threshold: BigInt('1000000000000'), unit: 'T', divisor: 1e12 },
      { threshold: BigInt('1000000000'), unit: 'G', divisor: 1e9 },
      { threshold: BigInt('1000000'), unit: 'M', divisor: 1e6 },
      { threshold: BigInt('1000'), unit: 'k', divisor: 1e3 },
    ];

    const found = THRESHOLDS.find((t) => maxBig >= t.threshold);
    const unit = found ? found.unit + 'H/s' : 'H/s';
    const scaleFactor = found ? found.divisor : 1;
    setHashrateUnit(unit);

    return sorted.map((stat) => ({
      timestampMs: stat.timestampMs,
      timestampStr: new Date(stat.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      workerCount: 'workerCount' in stat ? stat.workerCount : undefined,
      '1m': toNumberSafe(convertHashrate(stat.hashrate1m ?? '0')) / scaleFactor,
      '5m': toNumberSafe(convertHashrate(stat.hashrate5m ?? '0')) / scaleFactor,
      '1hr': toNumberSafe(convertHashrate(stat.hashrate1hr ?? '0')) / scaleFactor,
      '1d': toNumberSafe(convertHashrate(stat.hashrate1d ?? '0')) / scaleFactor,
      '7d': toNumberSafe(convertHashrate(stat.hashrate7d ?? '0')) / scaleFactor,
    }));
  }, [userStats]);

  // Debug logs (browser console) to inspect raw userStats and computed chartData
  if (typeof window !== 'undefined') {
    try {
  // Debug logs removed — keep code path clean in production build
    } catch (e) {
      // ignore
    }
  }

  const [visibleLines, setVisibleLines] = useState({
    '1m': false,
    '5m': true,
    '1hr': true,
    '1d': true,
    '7d': false,
  });

  const handleLegendClick = (dataKey: string) => {
    setVisibleLines((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const hashrateTooltipFormatter = (value: number, name: string) => [
    `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${hashrateUnit}`,
    name,
  ];

  const legendPayload = [
    {
      value: '1m',
      type: 'line',
      color: visibleLines['1m'] ? '#8884d8' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['1m'] ? (
          <span style={{ cursor: 'pointer' }}>{value}</span>
        ) : (
          <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>
            {value}
          </span>
        ),
    },
    {
      value: '5m',
      type: 'line',
      color: visibleLines['5m'] ? '#82ca9d' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['5m'] ? (
          <span style={{ cursor: 'pointer' }}>{value}</span>
        ) : (
          <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>
            {value}
          </span>
        ),
    },
    {
      value: '1hr',
      type: 'line',
      color: visibleLines['1hr'] ? '#ffc658' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['1hr'] ? (
          <span style={{ cursor: 'pointer' }}>{value}</span>
        ) : (
          <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>
            {value}
          </span>
        ),
    },
    {
      value: '1d',
      type: 'line',
      color: visibleLines['1d'] ? '#ff7300' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['1d'] ? (
          <span style={{ cursor: 'pointer' }}>{value}</span>
        ) : (
          <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>
            {value}
          </span>
        ),
    },
    {
      value: '7d',
      type: 'line',
      color: visibleLines['7d'] ? '#a4de6c' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['7d'] ? (
          <span style={{ cursor: 'pointer' }}>{value}</span>
        ) : (
          <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>
            {value}
          </span>
        ),
    },
  ];

  const workerCountChanged = useMemo(() => {
    if (!('workerCount' in userStats[0])) return false;
    const firstWorkerCount = userStats[0].workerCount;
    return userStats.some(
      (stat) => 'workerCount' in stat && stat.workerCount !== firstWorkerCount
    );
  }, [userStats]);

  return (
    <div className="space-y-8 mt-4">
      <div>
        <h2 className="text-xl font-bold mb-4">
          Hashrate History ({hashrateUnit})
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
          >
               <XAxis
                 dataKey="timestampMs"
                 type="number"
                 domain={["dataMin", "dataMax"]}
                 tickFormatter={(v) => new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
               />
            <YAxis
              allowDataOverflow={true}
              domain={[
                (dataMin: number) => Math.floor(dataMin * 0.99),
                (dataMax: number) => Math.ceil(dataMax * 1.01),
              ]}
            />
               <Tooltip labelFormatter={(label) => new Date(toNumberSafe(label)).toLocaleString()} />
            <Legend
              payload={legendPayload.map((item) => ({
                ...item,
                type: item.type as LegendType,
              }))}
              onClick={(e) => handleLegendClick(e.value)}
            />
               <Brush
                 dataKey="timestampMs"
              height={30}
              alwaysShowText={true}
              startIndex={
                chartData.length - 1440 > 0 ? chartData.length - 1440 : 0
              }
            />
            {visibleLines['1m'] && (
              <Line
                type="monotone"
                dataKey="1m"
                stroke="#8884d8"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {visibleLines['5m'] && (
              <Line
                type="monotone"
                dataKey="5m"
                stroke="#82ca9d"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {visibleLines['1hr'] && (
              <Line
                type="monotone"
                dataKey="1hr"
                stroke="#ffc658"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {visibleLines['1d'] && (
              <Line
                type="monotone"
                dataKey="1d"
                stroke="#ff7300"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {visibleLines['7d'] && (
              <Line
                type="monotone"
                dataKey="7d"
                stroke="#a4de6c"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {'workerCount' in userStats[0] && workerCountChanged && (
        <div>
          <h2 className="text-xl font-bold mb-4">Worker Count History</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
            >
              <XAxis dataKey="timestamp" minTickGap={50} />
              <YAxis
                allowDataOverflow={true}
                domain={[
                  (dataMin: number) => Math.floor(dataMin * 0.99),
                  (dataMax: number) => Math.ceil(dataMax * 1.01),
                ]}
              />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="workerCount"
                stroke="#8884d8"
                name="Workers"
                dot={false}
                isAnimationActive={false}
              />
              <Brush
                dataKey="timestamp"
                height={30}
                alwaysShowText={true}
                startIndex={
                  chartData.length - 1440 > 0 ? chartData.length - 1440 : 0
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
