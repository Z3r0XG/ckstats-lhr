'use client';

import { useState } from 'react';

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

import { PoolStats } from '../lib/entities/PoolStats';
import { convertHashrate, toNumberSafe } from '../utils/helpers';

interface PoolStatsChartProps {
  data: PoolStats[];
}

export default function PoolStatsChart({ data }: PoolStatsChartProps) {
  const [visibleLines, setVisibleLines] = useState({
    '1m': false,
    '5m': true,
    '15m': true,
    '1hr': true,
    '6hr': true,
    '1d': true,
    '7d': true,
  });

  const handleLegendClick = (dataKey: string) => {
    setVisibleLines((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  // Debug: log raw and formatted data in the browser console for inspection
  if (typeof window !== 'undefined') {
    try {
      // Debug logs removed — keep code path clean in production build
    } catch (e) {
      // ignore
    }
  }

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
      value: '15m',
      type: 'line',
      color: visibleLines['15m'] ? '#ffc658' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['15m'] ? (
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
      color: visibleLines['1hr'] ? '#ff7300' : '#aaaaaa',
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
      value: '6hr',
      type: 'line',
      color: visibleLines['6hr'] ? '#00C49F' : '#aaaaaa',
      formatter: (value: string) =>
        visibleLines['6hr'] ? (
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
      color: visibleLines['1d'] ? '#0088FE' : '#aaaaaa',
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
      color: visibleLines['7d'] ? '#FF1493' : '#aaaaaa',
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

  // Calculate the maximum hashrate using BigInt-aware parsing
  const maxHashrateBig: bigint = data
    .flatMap((stat) => [
      stat.hashrate1m,
      stat.hashrate5m,
      stat.hashrate15m,
      stat.hashrate1hr,
      stat.hashrate6hr,
      stat.hashrate1d,
      stat.hashrate7d,
    ])
    .map((v) => {
      try {
        return convertHashrate(v ?? '0');
      } catch (_) {
        return BigInt(0);
      }
    })
    .reduce((acc, cur) => (cur > acc ? cur : acc), BigInt(0));

  // Decide an ISO unit based on BigInt thresholds (keeps small numbers supported)
  const THRESHOLDS: { threshold: bigint; iso: string; divisor: number }[] = [
    { threshold: BigInt('1000000000000000000000'), iso: 'Z', divisor: 1e21 },
    { threshold: BigInt('1000000000000000000'), iso: 'E', divisor: 1e18 },
    { threshold: BigInt('1000000000000000'), iso: 'P', divisor: 1e15 },
    { threshold: BigInt('1000000000000'), iso: 'T', divisor: 1e12 },
    { threshold: BigInt('1000000000'), iso: 'G', divisor: 1e9 },
    { threshold: BigInt('1000000'), iso: 'M', divisor: 1e6 },
    { threshold: BigInt('1000'), iso: 'k', divisor: 1e3 },
  ];

  const found = THRESHOLDS.find((t) => maxHashrateBig >= t.threshold);
  const hashrateUnitIso = found ? found.iso : 'H/s';
  const hashrateDivisor: number = found ? found.divisor : 1;

  // use central helper

  // Create a numeric timestamp and sort ascending by time so the chart X axis is time-based
  const sorted = [...data]
    .map((item) => ({
      ...item,
      timestampMs: new Date(item.timestamp).getTime(),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  // Format the sorted data for the charts (use numeric timestampMs for X axis)
  const formattedData = sorted.map((item) => ({
    ...item,
    // keep the original timestamp for tooltips if needed
    timestampStr: new Date(item.timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  hashrate1m: toNumberSafe(convertHashrate(item.hashrate1m ?? '0')) / hashrateDivisor,
  hashrate5m: toNumberSafe(convertHashrate(item.hashrate5m ?? '0')) / hashrateDivisor,
  hashrate15m: toNumberSafe(convertHashrate(item.hashrate15m ?? '0')) / hashrateDivisor,
  hashrate1hr: toNumberSafe(convertHashrate(item.hashrate1hr ?? '0')) / hashrateDivisor,
  hashrate6hr: toNumberSafe(convertHashrate(item.hashrate6hr ?? '0')) / hashrateDivisor,
  hashrate1d: toNumberSafe(convertHashrate(item.hashrate1d ?? '0')) / hashrateDivisor,
  hashrate7d: toNumberSafe(convertHashrate(item.hashrate7d ?? '0')) / hashrateDivisor,
    SPS1m: item.SPS1m ?? 0,
    SPS5m: item.SPS5m ?? 0,
    SPS15m: item.SPS15m ?? 0,
    SPS1h: item.SPS1h ?? 0,
  }));

  const hashrateTooltipFormatter = (value: number, name: string) => [
    `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${hashrateUnitIso}H/s`,
    name,
  ];

  const spsTooltipFormatter = (value: number, name: string) => [
    `${value > 10 ? value.toFixed(0) : value.toFixed(1)} SPS`,
    name,
  ];

  const renderUsersChart = () => (
    <div className="h-80 w-full mb-8">
      <h2 className="text-xl font-bold mb-2">Users and Workers</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={formattedData}
          margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
        >
          <XAxis
            dataKey="timestampMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })}
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            allowDataOverflow={true}
            domain={[
              (dataMin: number) => Math.floor(dataMin * 0.99),
              (dataMax: number) => Math.ceil(dataMax * 1.01),
            ]}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            allowDataOverflow={true}
            domain={[
              (dataMin: number) => Math.floor(dataMin * 0.99),
              (dataMax: number) => Math.ceil(dataMax * 1.01),
            ]}
          />
          <Tooltip />
          <Legend />
          <Brush
            dataKey="timestampMs"
            height={30}
            alwaysShowText={true}
            startIndex={formattedData.length - 1440 > 0 ? formattedData.length - 1440 : 0}
            tickFormatter={(ms) => new Date(ms).toLocaleDateString()}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="users"
            stroke="#8884d8"
            activeDot={{ r: 8 }}
            name="Users"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="workers"
            stroke="#82ca9d"
            activeDot={{ r: 8 }}
            name="Workers"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderHashrateChart = () => (
    <div className="h-80 w-full mb-8">
      <h2 className="text-xl font-bold mb-2">
        Hashrate ({hashrateUnit.iso}H/s)
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={formattedData}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <XAxis dataKey="timestamp" minTickGap={40} />
          <YAxis
            allowDataOverflow={true}
            domain={[
              (dataMin: number) => Math.floor(dataMin * 0.99),
              (dataMax: number) => Math.ceil(dataMax * 1.01),
            ]}
          />
          <Tooltip formatter={hashrateTooltipFormatter} />
          <Legend
            payload={legendPayload.map((item) => ({
              ...item,
              type: item.type as LegendType,
            }))}
            onClick={(e) => handleLegendClick(e.value)}
          />
          <Brush
            dataKey="timestamp"
            height={30}
            alwaysShowText={true}
            startIndex={
              formattedData.length - 1440 > 0 ? formattedData.length - 1440 : 0
            }
          />
          {visibleLines['1m'] && (
            <Line
              type="monotone"
              dataKey="hashrate1m"
              name="1M"
              stroke="#8884d8"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['5m'] && (
            <Line
              type="monotone"
              dataKey="hashrate5m"
              name="5M"
              stroke="#82ca9d"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['15m'] && (
            <Line
              type="monotone"
              dataKey="hashrate15m"
              name="15M"
              stroke="#ffc658"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['1hr'] && (
            <Line
              type="monotone"
              dataKey="hashrate1hr"
              name="1HR"
              stroke="#ff7300"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['6hr'] && (
            <Line
              type="monotone"
              dataKey="hashrate6hr"
              name="6HR"
              stroke="#00C49F"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['1d'] && (
            <Line
              type="monotone"
              dataKey="hashrate1d"
              name="1D"
              stroke="#0088FE"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {visibleLines['7d'] && (
            <Line
              type="monotone"
              dataKey="hashrate7d"
              name="7D"
              stroke="#FF1493"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderSPSChart = () => (
    <div className="h-80 w-full mb-8">
      <h2 className="text-xl font-bold mb-2">Shares Per Second</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={formattedData}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <XAxis dataKey="timestamp" minTickGap={40} />
          <YAxis
            allowDataOverflow={true}
            domain={[
              (dataMin: number) => Math.floor(dataMin * 0.99),
              (dataMax: number) => Math.ceil(dataMax * 1.01),
            ]}
          />
          <Tooltip formatter={spsTooltipFormatter} />
          <Legend />
          <Brush
            dataKey="timestamp"
            height={30}
            alwaysShowText={true}
            startIndex={
              formattedData.length - 1440 > 0 ? formattedData.length - 1440 : 0
            }
          />
          <Line
            type="monotone"
            dataKey="SPS1m"
            name="1M"
            stroke="#8884d8"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="SPS5m"
            name="5M"
            stroke="#82ca9d"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="SPS15m"
            name="15M"
            stroke="#ffc658"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="SPS1h"
            name="1H"
            stroke="#ff7300"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="mt-4">
      {renderUsersChart()}
      {renderHashrateChart()}
      {renderSPSChart()}
    </div>
  );
}
