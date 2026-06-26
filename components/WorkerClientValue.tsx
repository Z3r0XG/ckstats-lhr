'use client';

import { useEffect, useState } from 'react';

import { getWorkerUserAgentDisplay } from '../utils/helpers';

interface WorkerClientValueProps {
  userAgentRaw: string | null;
  userAgent: string;
}

// The Client value on the single-worker page. There's no toggle here — it just honors the
// `showFullClientWorkers` preference set by the workers table's client/full toggle so the two views
// agree. Full raw UA (`userAgentRaw`) is the default; off shows our normalized token (`userAgent`),
// matching WorkersTable's `showFullClient` semantics exactly. Defaults to full on the server render
// and corrects on mount (same as the table), so a direct landing isn't stuck on the wrong form.
export default function WorkerClientValue({
  userAgentRaw,
  userAgent,
}: WorkerClientValueProps) {
  const [showFullClient, setShowFullClient] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const f = localStorage.getItem('showFullClientWorkers');
      if (f !== null) setShowFullClient(f === 'true'); // default stays true
    } catch (err) {
      console.debug('Failed to load showFullClientWorkers', err);
    }
  }, []);

  const value = showFullClient
    ? getWorkerUserAgentDisplay(userAgentRaw)
    : getWorkerUserAgentDisplay(userAgent);

  return <span title={userAgentRaw || ''}>{value}</span>;
}
