export const revalidate = 60;

import React from 'react';

import { getTopBestDiffs } from '../lib/api';
import { formatNumber, formatTimeAgo } from '../utils/helpers';

interface HighScoresProps {
  limit?: number;
}

const SMALL_LIMIT = 10;

export default async function HighScores({
  limit = SMALL_LIMIT,
}: HighScoresProps) {
  try {
    const topDiffs = await getTopBestDiffs(limit);
    const title = 'High Scores';

    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">{title}</h2>

          <div className="overflow-x-auto">
            <table className="table w-full table-sm sm:table-md">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Difficulty</th>
                  <th>Device</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {topDiffs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center text-sm text-base-content/60"
                    >
                      No Stats Available Yet
                    </td>
                  </tr>
                ) : (
                  topDiffs.map((d) => (
                    <tr key={d.rank}>
                      <td>{d.rank}</td>
                      <td className="text-accent font-semibold">
                        {formatNumber(d.difficulty)}
                      </td>
                      <td>{d.device}</td>
                      <td className="text-sm text-base-content/60">
                        {formatTimeAgo(d.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error fetching high scores:', error);
    return (
      <div className="card bg-base-100 shadow-xl card-compact sm:card-normal">
        <div className="card-body">
          <h2 className="card-title">High Scores</h2>
          <p className="text-error">
            Error loading high scores. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}
